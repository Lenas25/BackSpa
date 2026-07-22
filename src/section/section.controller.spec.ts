import { Test, TestingModule } from '@nestjs/testing';

// SectionController applies AuthGuard/RolesGuard at the class level (every
// route, including findAll). NestJS constructs guards referenced via
// @UseGuards during module compilation, so the real AuthGuard (and its
// JwtService dependency) would otherwise need full DI wiring just to
// unit-test findAll. Replace both guards with inert stand-ins, matching the
// pattern in test/course.e2e-spec.ts.
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
import { SectionController } from './section.controller';
// eslint-disable-next-line import/first
import { SectionService } from './section.service';

describe('SectionController', () => {
  let controller: SectionController;
  let service: { findAll: jest.Mock };

  beforeEach(async () => {
    service = { findAll: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SectionController],
      providers: [{ provide: SectionService, useValue: service }],
    }).compile();

    controller = module.get<SectionController>(SectionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll returns sections wrapped in the standard response envelope', async () => {
    const sections = [{ id: 1, name: 'Cohorte Enero' }];
    service.findAll.mockResolvedValue(sections);
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const response = { status } as never;

    await controller.findAll(response);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      message: 'Secciones obtenidas correctamente',
      data: sections,
    });
  });
});
