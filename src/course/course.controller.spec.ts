import { Test, TestingModule } from '@nestjs/testing';

// CourseController applies AuthGuard/RolesGuard on its ADMIN-only routes
// (POST/PATCH/DELETE). NestJS constructs guards referenced via @UseGuards
// during module compilation regardless of which method is under test, so
// the real AuthGuard (and its JwtService dependency) would otherwise need
// full DI wiring just to unit-test the public, unguarded `findAll` route.
// Replace both guards with inert stand-ins, matching the pattern in
// test/course.e2e-spec.ts.
jest.mock('src/auth/guard/auth.guard', () => ({
  AuthGuard: class AuthGuard {
    canActivate() {
      return true;
    }
  },
}));
jest.mock('src/auth/guard/roles.guard', () => ({
  RolesGuard: class RolesGuard {
    canActivate() {
      return true;
    }
  },
}));

// eslint-disable-next-line import/first
import { CourseController } from './course.controller';
// eslint-disable-next-line import/first
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
