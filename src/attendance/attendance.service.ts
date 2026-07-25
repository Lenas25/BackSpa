import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AttendanceDay } from './entities/attendance-day.entity';
import { Attendance } from './entities/attendance.entity';
import { Section } from 'src/section/entities/section.entity';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { AttendanceRecordDto } from './dto/attendance-record.dto';

export interface AttendanceDayView {
  id: number;
  sectionId: number;
  date: string;
  presentCount: number;
  totalCount: number;
}

export interface AttendanceRosterEntry {
  enrollmentId: number;
  studentName: string;
  present: boolean;
}

export interface AttendanceDayRosterView extends AttendanceDayView {
  roster: AttendanceRosterEntry[];
}

export interface AttendanceMetricsRow {
  enrollmentId: number;
  studentName: string;
  presentDays: number;
  totalDays: number;
  percentage: number;
}

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(AttendanceDay)
    private readonly attendanceDayRepository: Repository<AttendanceDay>,
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    @InjectRepository(Section)
    private readonly sectionRepository: Repository<Section>,
    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // Enrollment.user is declared `eager: true` as a single User on the
  // entity (src/enrollment/entities/enrollment.entity.ts), but is guarded
  // here defensively in case a relation ever surfaces as an array on some
  // read path, so studentName resolution never throws on an unexpected
  // shape (mirrors PaymentService.findBySection's `enrollment.user?.id`
  // optional-chaining defensiveness).
  private resolveStudentName(enrollment: Enrollment): string {
    const user = Array.isArray(enrollment.user)
      ? enrollment.user[0]
      : enrollment.user;
    return user ? `${user.name} ${user.lastName}` : '';
  }

  private toRosterEntry(attendance: Attendance): AttendanceRosterEntry {
    return {
      enrollmentId: attendance.enrollment.id,
      studentName: this.resolveStudentName(attendance.enrollment),
      present: attendance.present,
    };
  }

  // sectionId is passed explicitly instead of read off `day.section` so
  // callers that already know the section (every method here does) don't
  // need to eagerly load the `section` relation just to report its id back.
  private toDayView(
    day: AttendanceDay,
    sectionId: number,
    attendances: Attendance[],
  ): AttendanceDayView {
    return {
      id: day.id,
      sectionId,
      date: day.date,
      presentCount: attendances.filter((a) => a.present).length,
      totalCount: attendances.length,
    };
  }

  // Add Day + All-Present Default + No-Backfill (locked decisions,
  // sdd/asistencia/decisions): generates one Attendance row per ACTIVE
  // enrollment of the section, all present=true — mirrors
  // PaymentService.generateForEnrollment's per-enrollment child-row
  // generation, but fanned out across every currently-active enrollment
  // instead of installment numbers. Transactional so the day and its
  // roster are created atomically. (section, date) uniqueness is also
  // DB-enforced (@Unique(['section','date']) on AttendanceDay) — this
  // pre-check just turns a raw constraint violation into a clean 409.
  async createDay(
    sectionId: number,
    date: string,
  ): Promise<AttendanceDayRosterView> {
    const section = await this.sectionRepository.findOne({
      where: { id: sectionId },
    });
    if (!section) {
      throw new BadRequestException('La sección no existe');
    }

    const existingDay = await this.attendanceDayRepository.findOne({
      where: { section: { id: sectionId }, date },
    });
    if (existingDay) {
      throw new ConflictException(
        'Ya existe un registro de asistencia para esta sección en esta fecha',
      );
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const dayRepository = manager.getRepository(AttendanceDay);
        const attendanceRepository = manager.getRepository(Attendance);
        const enrollmentRepository = manager.getRepository(Enrollment);

        const activeEnrollments = await enrollmentRepository.find({
          where: { section: { id: sectionId }, active: true },
        });

        const day = await dayRepository.save(
          dayRepository.create({ section, date }),
        );

        const attendanceRows = activeEnrollments.map((enrollment) =>
          attendanceRepository.create({ day, enrollment, present: true }),
        );
        const savedAttendance =
          attendanceRows.length > 0
            ? await attendanceRepository.save(attendanceRows)
            : [];

        return {
          ...this.toDayView(day, sectionId, savedAttendance),
          roster: savedAttendance.map((a) => this.toRosterEntry(a)),
        };
      });
    } catch (e) {
      // The pre-check above is a fast path, not a guarantee — it's racy
      // under concurrent requests (TOCTOU). If two requests for the same
      // (section, date) both pass it, the loser hits the DB's
      // UNIQUE(section,date) constraint here and must still surface as a
      // clean 409, not bubble up as a raw QueryFailedError (which the
      // controller would otherwise map to a generic 400).
      if ((e as { code?: string })?.code === '23505') {
        throw new ConflictException(
          'Ya existe un registro de asistencia para esta sección en esta fecha',
        );
      }
      throw e;
    }
  }

  // Days List + Derived Counts (spec) — one row per AttendanceDay, ordered
  // by date, with presentCount/totalCount derived from its Attendance rows
  // (never stored — same "derive, don't duplicate" idiom as
  // PaymentService.toView's status).
  async findDaysBySection(sectionId: number): Promise<AttendanceDayView[]> {
    const days = await this.attendanceDayRepository.find({
      where: { section: { id: sectionId } },
      order: { date: 'ASC' },
    });
    if (days.length === 0) {
      return [];
    }

    const dayIds = days.map((day) => day.id);
    const attendances = await this.attendanceRepository.find({
      where: { day: { id: In(dayIds) } },
      relations: ['day'],
    });

    const attendancesByDayId = new Map<number, Attendance[]>();
    for (const attendance of attendances) {
      const list = attendancesByDayId.get(attendance.day.id) ?? [];
      list.push(attendance);
      attendancesByDayId.set(attendance.day.id, list);
    }

    return days.map((day) =>
      this.toDayView(day, sectionId, attendancesByDayId.get(day.id) ?? []),
    );
  }

  // Day Roster (spec) — the day plus every enrollment's present/absent
  // state for it.
  async findDayRoster(dayId: number): Promise<AttendanceDayRosterView> {
    const day = await this.attendanceDayRepository.findOne({
      where: { id: dayId },
      relations: ['section'],
    });
    if (!day) {
      throw new BadRequestException('El día de asistencia no existe');
    }

    const attendances = await this.attendanceRepository.find({
      where: { day: { id: dayId } },
      relations: ['enrollment'],
    });

    return {
      ...this.toDayView(day, day.section.id, attendances),
      roster: attendances.map((a) => this.toRosterEntry(a)),
    };
  }

  // Bulk Day Save (locked decision, sdd/asistencia/decisions): one PATCH
  // toggles every changed present flag for the day in a single
  // transaction — chosen over per-checkbox instant PATCH for consistency
  // with the app's existing save pattern (Notas/Estudiantes). enrollmentIds
  // that are not part of this day are silently ignored, since they cannot
  // match an existing Attendance row here.
  async updateDay(
    dayId: number,
    records: AttendanceRecordDto[],
  ): Promise<AttendanceDayRosterView> {
    const day = await this.attendanceDayRepository.findOne({
      where: { id: dayId },
    });
    if (!day) {
      throw new BadRequestException('El día de asistencia no existe');
    }

    await this.dataSource.transaction(async (manager) => {
      const attendanceRepository = manager.getRepository(Attendance);

      const attendances = await attendanceRepository.find({
        where: { day: { id: dayId } },
        relations: ['enrollment'],
      });
      const attendanceByEnrollmentId = new Map(
        attendances.map((a) => [a.enrollment.id, a]),
      );

      const toSave: Attendance[] = [];
      for (const record of records) {
        const attendance = attendanceByEnrollmentId.get(record.enrollmentId);
        if (!attendance) {
          continue;
        }
        attendance.present = record.present;
        toSave.push(attendance);
      }

      if (toSave.length > 0) {
        await attendanceRepository.save(toSave);
      }
    });

    return this.findDayRoster(dayId);
  }

  // Delete Day (spec) — cascades to its Attendance rows via the
  // AttendanceDay -> Attendance FK's ON DELETE CASCADE at the DB level,
  // same idiom as Enrollment -> Payment (no manual child cleanup here).
  async deleteDay(dayId: number): Promise<void> {
    const day = await this.attendanceDayRepository.findOne({
      where: { id: dayId },
    });
    if (!day) {
      throw new BadRequestException('El día de asistencia no existe');
    }
    await this.attendanceDayRepository.remove(day);
  }

  // Metrics + No-Backfill Denominator (locked decision,
  // sdd/asistencia/decisions): totalDays is the COUNT OF ATTENDANCE ROWS
  // that actually exist for that enrollment — NOT the section's total day
  // count. createDay only ever inserts a row for enrollments ACTIVE at
  // creation time, so a late-enrolling student's denominator reflects only
  // the days they actually have a recorded row for; no invented past
  // absences.
  async metricsBySection(sectionId: number): Promise<AttendanceMetricsRow[]> {
    const activeEnrollments = await this.enrollmentRepository.find({
      where: { section: { id: sectionId }, active: true },
    });
    if (activeEnrollments.length === 0) {
      return [];
    }

    const enrollmentIds = activeEnrollments.map((e) => e.id);
    const attendances = await this.attendanceRepository.find({
      where: { enrollment: { id: In(enrollmentIds) } },
      relations: ['enrollment'],
    });

    const attendancesByEnrollmentId = new Map<number, Attendance[]>();
    for (const attendance of attendances) {
      const list =
        attendancesByEnrollmentId.get(attendance.enrollment.id) ?? [];
      list.push(attendance);
      attendancesByEnrollmentId.set(attendance.enrollment.id, list);
    }

    return activeEnrollments.map((enrollment) => {
      const rows = attendancesByEnrollmentId.get(enrollment.id) ?? [];
      const totalDays = rows.length;
      const presentDays = rows.filter((a) => a.present).length;
      const percentage =
        totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

      return {
        enrollmentId: enrollment.id,
        studentName: this.resolveStudentName(enrollment),
        presentDays,
        totalDays,
        percentage,
      };
    });
  }
}
