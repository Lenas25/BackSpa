import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CourseService } from './course.service';
import { Course } from './entities/course.entity';
import { Section } from 'src/section/entities/section.entity';

describe('CourseService', () => {
  let service: CourseService;
  let courseRepository: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock; delete: jest.Mock };
  let sectionRepository: { count: jest.Mock };

  beforeEach(async () => {
    courseRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };
    sectionRepository = { count: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseService,
        { provide: getRepositoryToken(Course), useValue: courseRepository },
        { provide: getRepositoryToken(Section), useValue: sectionRepository },
      ],
    }).compile();

    service = module.get<CourseService>(CourseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('persists a new catalog course with name/description/imageUrl', async () => {
      const dto = { name: 'Full Stack', description: 'desc', imageUrl: 'img.png' };
      const created = { id: 1, ...dto };
      courseRepository.create.mockReturnValue(created);
      courseRepository.save.mockResolvedValue(created);

      const result = await service.create(dto as never);

      expect(courseRepository.create).toHaveBeenCalledWith(dto);
      expect(courseRepository.save).toHaveBeenCalledWith(created);
      expect(result).toEqual(created);
    });
  });

  describe('findAll', () => {
    it('returns every parent course without loading Section internals', async () => {
      const courses = [
        { id: 1, name: 'Full Stack', description: 'desc', imageUrl: 'img.png' },
        { id: 2, name: 'Data', description: 'desc2', imageUrl: 'img2.png' },
      ];
      courseRepository.find.mockResolvedValue(courses);

      const result = await service.findAll();

      // Public catalog endpoint MUST NOT expose Section internals
      // (dates, tutor, activities) — see spec's "Public Catalog Endpoint"
      // requirement. Loading the `sections` relation here previously leaked
      // that data straight through the unauthenticated GET /course response.
      expect(courseRepository.find).toHaveBeenCalledWith();
      expect(result).toEqual(courses);
    });
  });

  describe('findOne', () => {
    it('returns the requested course by id without loading Section internals', async () => {
      const course = { id: 1, name: 'Full Stack', description: 'desc', imageUrl: 'img.png' };
      courseRepository.findOne.mockResolvedValue(course);

      const result = await service.findOne(1);

      expect(courseRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toEqual(course);
    });
  });

  describe('remove', () => {
    it('deletes an existing catalog course that has no sections', async () => {
      sectionRepository.count.mockResolvedValue(0);
      courseRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.remove(1);

      expect(sectionRepository.count).toHaveBeenCalledWith({ where: { course: { id: 1 } } });
      expect(courseRepository.delete).toHaveBeenCalledWith(1);
      expect(result.affected).toBe(1);
    });

    it('throws when the course does not exist', async () => {
      sectionRepository.count.mockResolvedValue(0);
      courseRepository.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove(999)).rejects.toThrow();
    });

    it('rejects with a 409 ConflictException when the course still has sections', async () => {
      sectionRepository.count.mockResolvedValue(2);

      await expect(service.remove(1)).rejects.toThrow(ConflictException);
      expect(courseRepository.delete).not.toHaveBeenCalled();
    });
  });
});
