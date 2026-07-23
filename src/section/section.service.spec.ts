import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SectionService } from './section.service';
import { Section } from './entities/section.entity';
import { Course } from 'src/course/entities/course.entity';
import { Activity } from 'src/activity/entities/activity.entity';
import { User } from 'src/user/entities/user.entity';
import { Role } from 'src/common/enums/role.enum';
import { PaymentService } from 'src/payment/payment.service';

describe('SectionService', () => {
  let service: SectionService;
  let sectionRepository: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock; delete: jest.Mock };
  let courseRepository: { findOne: jest.Mock };
  let activityRepository: { create: jest.Mock; save: jest.Mock; find: jest.Mock; remove: jest.Mock };
  let userRepository: { findOne: jest.Mock };
  let paymentService: { adjustForSection: jest.Mock };

  beforeEach(async () => {
    sectionRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };
    courseRepository = { findOne: jest.fn() };
    activityRepository = { create: jest.fn(), save: jest.fn(), find: jest.fn(), remove: jest.fn() };
    userRepository = { findOne: jest.fn() };
    paymentService = { adjustForSection: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SectionService,
        { provide: getRepositoryToken(Section), useValue: sectionRepository },
        { provide: getRepositoryToken(Course), useValue: courseRepository },
        { provide: getRepositoryToken(Activity), useValue: activityRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: PaymentService, useValue: paymentService },
      ],
    }).compile();

    service = module.get<SectionService>(SectionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('persists a new section linked to its parent course', async () => {
      const parentCourse = { id: 5, name: 'Full Stack' } as Course;
      courseRepository.findOne.mockResolvedValue(parentCourse);
      const createdSection = { id: 1, name: 'Cohorte Enero', course: parentCourse };
      sectionRepository.create.mockReturnValue(createdSection);
      sectionRepository.save.mockResolvedValue(createdSection);

      const result = await service.create({
        name: 'Cohorte Enero',
        initialDate: new Date('2026-01-10'),
        endDate: new Date('2026-06-10'),
        duration: 5,
        activities: [],
        id_course: 5,
      } as never);

      expect(courseRepository.findOne).toHaveBeenCalledWith({ where: { id: 5 } });
      expect(sectionRepository.save).toHaveBeenCalledWith(createdSection);
      expect(result).toEqual(createdSection);
    });

    it('rejects creation when the parent course does not exist', async () => {
      courseRepository.findOne.mockResolvedValue(null);

      await expect(
        service.create({
          name: 'Cohorte Enero',
          initialDate: new Date('2026-01-10'),
          endDate: new Date('2026-06-10'),
          duration: 5,
          activities: [],
          id_course: 999,
        } as never),
      ).rejects.toThrow();
    });
  });

  describe('findAll', () => {
    it('returns every section with its activities and tutor when called with no user context (e.g. ADMIN)', async () => {
      const sections = [{ id: 1, name: 'Cohorte Enero' }, { id: 2, name: 'Cohorte Julio' }];
      sectionRepository.find.mockResolvedValue(sections);

      const result = await service.findAll();

      expect(sectionRepository.find).toHaveBeenCalledWith({ relations: ['activities', 'tutor', 'course'] });
      expect(result).toEqual(sections);
    });

    it('returns every section for an ADMIN requesting user', async () => {
      const sections = [{ id: 1, name: 'Cohorte Enero' }];
      sectionRepository.find.mockResolvedValue(sections);

      await service.findAll({ id: 'admin-1', role: Role.ADMIN });

      expect(sectionRepository.find).toHaveBeenCalledWith({ relations: ['activities', 'tutor', 'course'] });
    });

    // Role-Based Section Access (spec: "tutor-scoping" domain) — TUTOR is
    // limited to their own sections when listing.
    it('filters to only the requesting TUTOR\'s own sections', async () => {
      const ownSections = [{ id: 1, name: 'Cohorte Enero', tutor: { id: 'tutor-1' } }];
      sectionRepository.find.mockResolvedValue(ownSections);

      const result = await service.findAll({ id: 'tutor-1', role: Role.TUTOR });

      expect(sectionRepository.find).toHaveBeenCalledWith({
        where: { tutor: { id: 'tutor-1' } },
        relations: ['activities', 'tutor', 'course'],
      });
      expect(result).toEqual(ownSections);
    });
  });

  describe('findOne', () => {
    it('returns the requested section by id', async () => {
      const section = { id: 1, name: 'Cohorte Enero' };
      sectionRepository.findOne.mockResolvedValue(section);

      const result = await service.findOne(1);

      expect(sectionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['activities', 'tutor', 'course'],
      });
      expect(result).toEqual(section);
    });
  });

  describe('update — activity diffing', () => {
    const existingSection = { id: 1, name: 'Cohorte Enero' };

    beforeEach(() => {
      sectionRepository.findOne.mockResolvedValue({ ...existingSection });
      sectionRepository.save.mockResolvedValue(existingSection);
    });

    it('updates the percentage of an existing activity matched by id', async () => {
      const existingActivity = { id: 10, name: 'Parcial 1', percentage: 50 };
      activityRepository.find.mockResolvedValue([existingActivity]);
      activityRepository.save.mockResolvedValue({ ...existingActivity, percentage: 60 });

      await service.update(1, {
        activities: [{ id: 10, name: 'Parcial 1', percentage: 60 }],
      } as never);

      expect(activityRepository.find).toHaveBeenCalledWith({ where: { section: { id: 1 } } });
      expect(activityRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 10, name: 'Parcial 1', percentage: 60 }),
      );
    });

    it('creates a new activity when no id is present in the incoming payload', async () => {
      activityRepository.find.mockResolvedValue([]);
      const created = { name: 'Parcial 2', percentage: 40 };
      activityRepository.create.mockReturnValue(created);
      activityRepository.save.mockResolvedValue({ id: 20, ...created });

      await service.update(1, {
        activities: [{ name: 'Parcial 2', percentage: 40 }],
      } as never);

      expect(activityRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Parcial 2', percentage: 40 }),
      );
      expect(activityRepository.save).toHaveBeenCalledWith(created);
    });

    it('removes activities that exist in the DB but are absent from the incoming payload', async () => {
      const staleActivity = { id: 11, name: 'Parcial viejo', percentage: 100 };
      activityRepository.find.mockResolvedValue([staleActivity]);

      await service.update(1, { activities: [] } as never);

      expect(activityRepository.remove).toHaveBeenCalledWith([staleActivity]);
    });

    it('does not touch activities when the update payload omits the field entirely', async () => {
      await service.update(1, { name: 'Cohorte Renombrada' } as never);

      expect(activityRepository.find).not.toHaveBeenCalled();
      expect(activityRepository.save).not.toHaveBeenCalled();
      expect(activityRepository.remove).not.toHaveBeenCalled();
    });

    // Regression guard for the reported bug "edited a section's activities
    // (changed one %, added a new one), saved, but GET still returns old
    // activities" — reproduces the exact combined scenario (one update + one
    // create + one implicit keep, in a SINGLE payload) that prior tests only
    // covered as isolated single-op cases.
    it('applies an update, a create, and a removal together from a single combined payload', async () => {
      const keptActivity = { id: 10, name: 'Parcial 1', percentage: 50 };
      const changedActivity = { id: 11, name: 'Parcial 2', percentage: 50 };
      const staleActivity = { id: 12, name: 'Parcial viejo', percentage: 0 };
      activityRepository.find.mockResolvedValue([keptActivity, changedActivity, staleActivity]);
      activityRepository.save.mockImplementation((activity) => Promise.resolve(activity));
      const newCreated = { name: 'Parcial nuevo', percentage: 20 };
      activityRepository.create.mockReturnValue(newCreated);

      await service.update(1, {
        activities: [
          { id: 10, name: 'Parcial 1', percentage: 50 },
          { id: 11, name: 'Parcial 2', percentage: 30 },
          { name: 'Parcial nuevo', percentage: 20 },
        ],
      } as never);

      // changed activity (id 11) persisted with its new percentage
      expect(activityRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 11, name: 'Parcial 2', percentage: 30 }),
      );
      // unchanged activity (id 10) is still round-tripped through save (no
      // special-case skip — matches existing reconcileActivities behavior)
      expect(activityRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 10, name: 'Parcial 1', percentage: 50 }),
      );
      // brand-new activity (no id) is created and saved
      expect(activityRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Parcial nuevo', percentage: 20 }),
      );
      expect(activityRepository.save).toHaveBeenCalledWith(newCreated);
      // activity absent from the incoming payload (id 12) is removed, its
      // grades cascade-delete at the DB FK level
      expect(activityRepository.remove).toHaveBeenCalledWith([staleActivity]);
    });
  });

  describe('remove', () => {
    it('deletes an existing section', async () => {
      sectionRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.remove(1);

      expect(sectionRepository.delete).toHaveBeenCalledWith(1);
      expect(result.affected).toBe(1);
    });

    it('throws when the section does not exist', async () => {
      sectionRepository.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove(999)).rejects.toThrow();
    });
  });
});
