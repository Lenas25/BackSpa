import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CourseService } from './course.service';
import { Course } from './entities/course.entity';

describe('CourseService', () => {
  let service: CourseService;
  let courseRepository: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    courseRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseService,
        { provide: getRepositoryToken(Course), useValue: courseRepository },
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
    it('returns every parent course with its sections', async () => {
      const courses = [{ id: 1, name: 'Full Stack' }, { id: 2, name: 'Data' }];
      courseRepository.find.mockResolvedValue(courses);

      const result = await service.findAll();

      expect(courseRepository.find).toHaveBeenCalledWith({ relations: ['sections'] });
      expect(result).toEqual(courses);
    });
  });

  describe('findOne', () => {
    it('returns the requested course by id', async () => {
      const course = { id: 1, name: 'Full Stack' };
      courseRepository.findOne.mockResolvedValue(course);

      const result = await service.findOne(1);

      expect(courseRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 }, relations: ['sections'] });
      expect(result).toEqual(course);
    });
  });

  describe('remove', () => {
    it('deletes an existing catalog course', async () => {
      courseRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.remove(1);

      expect(courseRepository.delete).toHaveBeenCalledWith(1);
      expect(result.affected).toBe(1);
    });

    it('throws when the course does not exist', async () => {
      courseRepository.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove(999)).rejects.toThrow();
    });
  });
});
