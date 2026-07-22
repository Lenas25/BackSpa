import { Test, TestingModule } from '@nestjs/testing';
import { CourseController } from './course.controller';
import { CourseService } from './course.service';

describe('CourseController', () => {
  let controller: CourseController;
  let service: { findAll: jest.Mock };

  beforeEach(async () => {
    service = { findAll: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CourseController],
      providers: [{ provide: CourseService, useValue: service }],
    }).compile();

    controller = module.get<CourseController>(CourseController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll returns catalog courses wrapped in the standard response envelope', async () => {
    const courses = [{ id: 1, name: 'Full Stack' }];
    service.findAll.mockResolvedValue(courses);
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const response = { status } as never;

    await controller.findAll(response);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      message: 'Cursos obtenidos correctamente',
      data: courses,
    });
  });
});
