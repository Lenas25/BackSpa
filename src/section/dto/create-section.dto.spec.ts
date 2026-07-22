import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateSectionDto } from './create-section.dto';
import { UpdateSectionDto } from './update-section.dto';

// Activity Percentage Validation (spec: "section-management" domain) —
// Section activities MUST sum to exactly 100%; the system MUST reject save
// when the sum differs.
describe('CreateSectionDto — activities percentage sum validation', () => {
  const basePayload = {
    name: 'Cohorte Enero',
    initialDate: '2026-01-10',
    endDate: '2026-06-10',
    duration: 5,
    id_course: 1,
  };

  it('rejects when activities sum to less than 100', async () => {
    const dto = plainToInstance(CreateSectionDto, {
      ...basePayload,
      activities: [
        { name: 'Parcial 1', percentage: 50 },
        { name: 'Parcial 2', percentage: 40 },
      ],
    });

    const errors = await validate(dto);

    const activitiesError = errors.find((e) => e.property === 'activities');
    expect(activitiesError).toBeDefined();
    expect(activitiesError!.constraints).toMatchObject({
      activitiesSumTo100: expect.any(String),
    });
  });

  it('rejects when activities sum to more than 100', async () => {
    const dto = plainToInstance(CreateSectionDto, {
      ...basePayload,
      activities: [
        { name: 'Parcial 1', percentage: 60 },
        { name: 'Parcial 2', percentage: 60 },
      ],
    });

    const errors = await validate(dto);

    expect(errors.find((e) => e.property === 'activities')).toBeDefined();
  });

  it('accepts when activities sum to exactly 100', async () => {
    const dto = plainToInstance(CreateSectionDto, {
      ...basePayload,
      activities: [
        { name: 'Parcial 1', percentage: 60 },
        { name: 'Parcial 2', percentage: 40 },
      ],
    });

    const errors = await validate(dto);

    expect(errors.find((e) => e.property === 'activities')).toBeUndefined();
  });

  it('accepts fractional percentages that sum to exactly 100 (rounding-safe)', async () => {
    const dto = plainToInstance(CreateSectionDto, {
      ...basePayload,
      activities: [
        { name: 'Parcial 1', percentage: 33.33 },
        { name: 'Parcial 2', percentage: 33.33 },
        { name: 'Parcial 3', percentage: 33.34 },
      ],
    });

    const errors = await validate(dto);

    expect(errors.find((e) => e.property === 'activities')).toBeUndefined();
  });
});

describe('UpdateSectionDto — activities percentage sum validation', () => {
  it('rejects an update payload whose activities do not sum to 100', async () => {
    const dto = plainToInstance(UpdateSectionDto, {
      activities: [
        { name: 'Parcial 1', percentage: 50 },
        { name: 'Parcial 2', percentage: 20 },
      ],
    });

    const errors = await validate(dto);

    expect(errors.find((e) => e.property === 'activities')).toBeDefined();
  });

  it('allows an update payload that omits activities entirely', async () => {
    const dto = plainToInstance(UpdateSectionDto, { name: 'Cohorte Renombrada' });

    const errors = await validate(dto);

    expect(errors.find((e) => e.property === 'activities')).toBeUndefined();
  });
});
