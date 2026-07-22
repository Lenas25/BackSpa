import { Injectable } from '@nestjs/common';
import type { CreateSectionDto } from './dto/create-section.dto';
import type { UpdateSectionDto } from './dto/update-section.dto';
import { Section } from './entities/section.entity';
import type { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Activity } from 'src/activity/entities/activity.entity';
import { User } from 'src/user/entities/user.entity';
import { Course } from 'src/course/entities/course.entity';
import type { CreateActivityDto } from 'src/activity/dto/create-activity.dto';
import { Role } from 'src/common/enums/role.enum';

// JWT payload shape attached to the request by AuthGuard (see auth.service's
// login() payload: { role, id }).
export interface RequestingUser {
  id: string;
  role: Role;
}

@Injectable()
export class SectionService {

  constructor(
    @InjectRepository(Section)
    private sectionRepository: Repository<Section>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(Activity)
    private activityRepository: Repository<Activity>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) { }

  async create(createSectionDto: CreateSectionDto) {
    try {
      const course = await this.courseRepository.findOne({ where: { id: createSectionDto.id_course } });
      if (!course) {
        throw new Error('No se encontró el curso padre');
      }
      let tutor: User | null = null;
      if (createSectionDto.id_tutor) {
        tutor = await this.userRepository.findOne({ where: { id: createSectionDto.id_tutor } });
        if (!tutor) {
          throw new Error('No se encontró el tutor');
        }
      }
      const { id_tutor: _idTutor, id_course: _idCourse, ...sectionData } = createSectionDto;
      const newSection = this.sectionRepository.create({
        ...sectionData,
        course,
        tutor,
      });
      await this.sectionRepository.save(newSection);
      if (createSectionDto.activities && createSectionDto.activities.length > 0) {
        const activities = createSectionDto.activities.map(activityDto => {
          const activity = this.activityRepository.create(activityDto);
          activity.section = newSection;
          return activity;
        });
        await this.activityRepository.save(activities);
      }
      return newSection;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  // Role-Based Section Access (spec: "tutor-scoping" domain) — TUTOR is
  // limited to their own sections when listing; ADMIN (or callers with no
  // user context, e.g. internal use) see every section.
  async findAll(requestingUser?: RequestingUser) {
    if (requestingUser?.role === Role.TUTOR) {
      return await this.sectionRepository.find({
        where: { tutor: { id: requestingUser.id } },
        relations: ['activities', 'tutor', 'course'],
      });
    }
    return await this.sectionRepository.find({ relations: ['activities', 'tutor', 'course'] });
  }

  async findOne(id: number) {
    try {
      return await this.sectionRepository.findOne({
        where: {
          id,
        },
        relations: ['activities', 'tutor', 'course'],
      });
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async update(id: number, updateSectionDto: UpdateSectionDto) {
    try {
      const section = await this.sectionRepository.findOne({ where: { id } });
      if (!section) {
        throw new Error('No se encontró la sección');
      }
      const { activities, id_tutor, id_course, ...sectionData } = updateSectionDto;
      Object.assign(section, sectionData);
      if (id_tutor) {
        const tutor = await this.userRepository.findOne({ where: { id: id_tutor } });
        if (!tutor) {
          throw new Error('No se encontró el tutor');
        }
        section.tutor = tutor;
      }
      if (id_course) {
        const course = await this.courseRepository.findOne({ where: { id: id_course } });
        if (!course) {
          throw new Error('No se encontró el curso padre');
        }
        section.course = course;
      }
      await this.sectionRepository.save(section);

      if (activities) {
        await this.reconcileActivities(section, activities);
      }

      return await this.sectionRepository.findOne({ where: { id }, relations: ['activities', 'tutor', 'course'] });
    } catch (error) {
      throw new Error(`Error actualizando la sección: ${error}`);
    }
  }

  // Reconciles the section's activities against the incoming payload:
  // - Entries with an existing `id` update that activity in place.
  // - Entries without an `id` are created fresh (linked to this section).
  // - Existing DB activities whose id is no longer present are removed;
  //   their Grade rows cascade-delete at the DB level (FK ON DELETE CASCADE
  //   on Grade.activity), per the "Activity Editing With Existing Grades"
  //   spec requirement.
  private async reconcileActivities(
    section: Section,
    activities: CreateActivityDto[],
  ) {
    const existingActivities = await this.activityRepository.find({
      where: { section: { id: section.id } },
    });

    const incomingIds = new Set(
      activities.filter((a) => a.id != null).map((a) => a.id),
    );

    const toRemove = existingActivities.filter((a) => !incomingIds.has(a.id));
    if (toRemove.length > 0) {
      await this.activityRepository.remove(toRemove);
    }

    for (const activityDto of activities) {
      const existing =
        activityDto.id != null
          ? existingActivities.find((a) => a.id === activityDto.id)
          : undefined;

      if (existing) {
        existing.name = activityDto.name;
        existing.percentage = activityDto.percentage;
        await this.activityRepository.save(existing);
        continue;
      }

      const newActivity = this.activityRepository.create({
        name: activityDto.name,
        percentage: activityDto.percentage,
        section,
      });
      await this.activityRepository.save(newActivity);
    }
  }

  async remove(id: number) {
    try {
      const detail = await this.sectionRepository.delete(id);
      if (detail.affected === 0) {
        throw new Error("No se pudo eliminar la sección");
      }
      return detail;
    } catch (error) {
      throw new Error(error.message);
    }
  }
}
