import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { InstitutionConfigService } from './institution-config.service';
import { InstitutionConfig } from './entities/institution-config.entity';
import { UpdateInstitutionConfigDto } from './dto/update-institution-config.dto';

// Fixed-id singleton config table (spec: "Constancia de Calificaciones" PDF
// text). get()/update() both always target the row with id = 1, ensuring it
// exists (seed defaults) before reading/patching it — see
// InstitutionConfigService for the exact seed values, which mirror the ones
// documented for this module.
describe('InstitutionConfigService', () => {
  let service: InstitutionConfigService;
  let repository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  const DEFAULT_SEED = {
    academyName: 'Alejandra Academia de Belleza',
    headerLines: [
      'República Bolivariana de Venezuela',
      'Ministerio del Poder Popular para la Educación',
      'Alejandra Academia de Belleza',
    ],
    signatoryName: '',
    signatoryTitle: 'Directora',
    city: '',
    contactFooter: '',
    gradeScaleText:
      'Los resultados se interpretan en la escala numérica del 0 al 20; la calificación mínima aprobatoria es 11.',
    minApproving: 11,
    approvedLabel: 'APROBADO',
    failedLabel: 'DESAPROBADO',
  };

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstitutionConfigService,
        {
          provide: getRepositoryToken(InstitutionConfig),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<InstitutionConfigService>(InstitutionConfigService);
  });

  describe('get()', () => {
    it('returns the existing row when present', async () => {
      const existing = { id: 1, ...DEFAULT_SEED, city: 'Caracas' };
      repository.findOne.mockResolvedValue(existing);

      const result = await service.get();

      expect(result).toEqual(existing);
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('always targets the id = 1 singleton row', async () => {
      repository.findOne.mockResolvedValue({ id: 1, ...DEFAULT_SEED });

      await service.get();

      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('creates and returns the default seed row (id = 1) when the table is empty', async () => {
      repository.findOne.mockResolvedValue(null);
      const created = { ...DEFAULT_SEED, id: 1 };
      repository.create.mockReturnValue(created);
      repository.save.mockResolvedValue(created);

      const result = await service.get();

      expect(repository.create).toHaveBeenCalledWith({
        ...DEFAULT_SEED,
        id: 1,
      });
      expect(repository.save).toHaveBeenCalledWith(created);
      expect(result).toEqual({ id: 1, ...DEFAULT_SEED });
    });

    it('re-reads and returns the id = 1 row when a concurrent first-read wins the insert race', async () => {
      // Simulates two concurrent first-reads on an empty table: both see
      // "missing", both attempt to create id = 1. This call loses — save()
      // rejects with a duplicate-key error — so get() must recover by
      // re-reading the row the other, winning call just created, instead of
      // throwing or creating a second row.
      const winnerRow = { id: 1, ...DEFAULT_SEED };
      repository.findOne
        .mockResolvedValueOnce(null) // initial read: table looks empty
        .mockResolvedValueOnce(winnerRow); // re-read after duplicate-key conflict
      const created = { ...DEFAULT_SEED, id: 1 };
      repository.create.mockReturnValue(created);
      repository.save.mockRejectedValue(
        new QueryFailedError('INSERT', [], new Error('duplicate key value')),
      );

      const result = await service.get();

      expect(result).toEqual(winnerRow);
      expect(repository.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('update()', () => {
    it('applies a partial update and returns the full merged config', async () => {
      const existing = { id: 1, ...DEFAULT_SEED };
      repository.findOne.mockResolvedValue(existing);
      repository.save.mockImplementation(async (entity) => entity);

      const result = await service.update({ city: 'Caracas', minApproving: 12 });

      expect(result).toEqual({
        ...DEFAULT_SEED,
        id: 1,
        city: 'Caracas',
        minApproving: 12,
      });
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ city: 'Caracas', minApproving: 12 }),
      );
    });

    it('creates the default row (id = 1) first, then applies the patch, when no row exists', async () => {
      repository.findOne.mockResolvedValue(null);
      const created = { ...DEFAULT_SEED, id: 1 };
      repository.create.mockReturnValue(created);
      // First save (inside get()) persists the seed with id 1; second save
      // (the patch) persists the merged entity.
      repository.save
        .mockImplementationOnce(async (entity) => entity)
        .mockImplementationOnce(async (entity) => entity);

      const result = await service.update({ signatoryName: 'Ana Pérez' });

      expect(repository.create).toHaveBeenCalledWith({
        ...DEFAULT_SEED,
        id: 1,
      });
      expect(result).toEqual({
        id: 1,
        ...DEFAULT_SEED,
        signatoryName: 'Ana Pérez',
      });
    });

    it('applies the patch to the id = 1 row specifically', async () => {
      repository.findOne.mockResolvedValue({ id: 1, ...DEFAULT_SEED });
      repository.save.mockImplementation(async (entity) => entity);

      await service.update({ city: 'Maracaibo' });

      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, city: 'Maracaibo' }),
      );
    });
  });

  describe('UpdateInstitutionConfigDto validation', () => {
    it('accepts minApproving at the boundary values 0 and 20', async () => {
      const low = plainToInstance(UpdateInstitutionConfigDto, { minApproving: 0 });
      const high = plainToInstance(UpdateInstitutionConfigDto, { minApproving: 20 });

      expect(await validate(low)).toHaveLength(0);
      expect(await validate(high)).toHaveLength(0);
    });

    it('rejects minApproving outside the 0..20 range', async () => {
      const tooLow = plainToInstance(UpdateInstitutionConfigDto, { minApproving: -1 });
      const tooHigh = plainToInstance(UpdateInstitutionConfigDto, { minApproving: 21 });

      expect(await validate(tooLow)).not.toHaveLength(0);
      expect(await validate(tooHigh)).not.toHaveLength(0);
    });

    it('rejects an empty string inside headerLines', async () => {
      const dto = plainToInstance(UpdateInstitutionConfigDto, {
        headerLines: ['Valid line', ''],
      });

      expect(await validate(dto)).not.toHaveLength(0);
    });
  });
});
