import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SectionService } from './section.service';
import { Section } from './entities/section.entity';
import { Course } from 'src/course/entities/course.entity';
import { Activity } from 'src/activity/entities/activity.entity';
import { User } from 'src/user/entities/user.entity';

describe('SectionService', () => {
  let service: SectionService;
  let sectionRepository: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock; delete: jest.Mock };
  let courseRepository: { findOne: jest.Mock };
  let activityRepository: { create: jest.Mock; save: jest.Mock; find: jest.Mock };
  let userRepository: { findOne: jest.Mock };

  beforeEach(async () => {
    sectionRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };
    courseRepository = { findOne: jest.fn() };
    activityRepository = { create: jest.fn(), save: jest.fn(), find: jest.fn() };
    userRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SectionService,
        { provide: getRepositoryToken(Section), useValue: sectionRepository },
        { provide: getRepositoryToken(Course), useValue: courseRepository },
        { provide: getRepositoryToken(Activity), useValue: activityRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
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
    it('returns every section with its activities and tutor', async () => {
      const sections = [{ id: 1, name: 'Cohorte Enero' }, { id: 2, name: 'Cohorte Julio' }];
      sectionRepository.find.mockResolvedValue(sections);

      const result = await service.findAll();

      expect(sectionRepository.find).toHaveBeenCalledWith({ relations: ['activities', 'tutor', 'course'] });
      expect(result).toEqual(sections);
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
