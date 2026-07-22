import { Test, TestingModule } from '@nestjs/testing';
import { SectionController } from './section.controller';
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
