import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateSectionDto } from './create-section.dto';
import { UpdateSectionDto } from './update-section.dto';

// Activity Percentage Validation (spec: "section-management" domain,
// user-approved change 2026-07-22) — the sum of activity percentages is NO
// LONGER a server-side requirement (sum is an indicator-only, client-side
// warning above 100%). Per-activity bounds (percentage > 0 and <= 100, name
// required) remain enforced server-side.
describe('CreateSectionDto — activities percentage sum is no longer enforced', () => {
  const basePayload = {
    name: 'Cohorte Enero',
    initialDate: '2026-01-10',
    endDate: '2026-06-10',
    duration: 5,
    id_course: 1,
  };

  it('accepts when activities sum to less than 100', async () => {
    const dto = plainToInstance(CreateSectionDto, {
      ...basePayload,
      activities: [
        { name: 'Parcial 1', percentage: 50 },
        { name: 'Parcial 2', percentage: 40 },
      ],
    });

    const errors = await validate(dto);

    expect(errors.find((e) => e.property === 'activities')).toBeUndefined();
  });

  it('accepts when activities sum to more than 100', async () => {
    const dto = plainToInstance(CreateSectionDto, {
      ...basePayload,
      activities: [
        { name: 'Parcial 1', percentage: 60 },
        { name: 'Parcial 2', percentage: 60 },
      ],
    });

    const errors = await validate(dto);

    expect(errors.find((e) => e.property === 'activities')).toBeUndefined();
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

  it('accepts a single activity weighted at 100 (edge case unlocked by removing the sum requirement)', async () => {
    const dto = plainToInstance(CreateSectionDto, {
      ...basePayload,
      activities: [{ name: 'Único', percentage: 100 }],
    });

    const errors = await validate(dto);

    expect(errors.find((e) => e.property === 'activities')).toBeUndefined();
  });
});

describe('CreateSectionDto — per-activity bounds (percentage > 0 and <= 100, name required)', () => {
  const basePayload = {
    name: 'Cohorte Enero',
    initialDate: '2026-01-10',
    endDate: '2026-06-10',
    duration: 5,
    id_course: 1,
  };

  it('rejects an activity with percentage <= 0', async () => {
    const dto = plainToInstance(CreateSectionDto, {
      ...basePayload,
      activities: [{ name: 'Parcial 1', percentage: 0 }],
    });

    const errors = await validate(dto, { validationError: { target: false } });
    const activitiesError = errors.find((e) => e.property === 'activities');

    expect(activitiesError).toBeDefined();
  });

  it('rejects an activity with a negative percentage', async () => {
    const dto = plainToInstance(CreateSectionDto, {
      ...basePayload,
      activities: [{ name: 'Parcial 1', percentage: -10 }],
    });

    const errors = await validate(dto, { validationError: { target: false } });

    expect(errors.find((e) => e.property === 'activities')).toBeDefined();
  });

  it('rejects an activity with percentage > 100', async () => {
    const dto = plainToInstance(CreateSectionDto, {
      ...basePayload,
      activities: [{ name: 'Parcial 1', percentage: 150 }],
    });

    const errors = await validate(dto, { validationError: { target: false } });

    expect(errors.find((e) => e.property === 'activities')).toBeDefined();
  });

  it('rejects an activity with an empty name', async () => {
    const dto = plainToInstance(CreateSectionDto, {
      ...basePayload,
      activities: [{ name: '', percentage: 50 }],
    });

    const errors = await validate(dto, { validationError: { target: false } });

    expect(errors.find((e) => e.property === 'activities')).toBeDefined();
  });

  it('accepts an activity with percentage exactly 100 (upper bound inclusive)', async () => {
    const dto = plainToInstance(CreateSectionDto, {
      ...basePayload,
      activities: [{ name: 'Único', percentage: 100 }],
    });

    const errors = await validate(dto);

    expect(errors.find((e) => e.property === 'activities')).toBeUndefined();
  });
});

describe('UpdateSectionDto — activities percentage sum is no longer enforced', () => {
  it('accepts an update payload whose activities do not sum to 100', async () => {
    const dto = plainToInstance(UpdateSectionDto, {
      activities: [
        { name: 'Parcial 1', percentage: 50 },
        { name: 'Parcial 2', percentage: 20 },
      ],
    });

    const errors = await validate(dto);

    expect(errors.find((e) => e.property === 'activities')).toBeUndefined();
  });

  it('allows an update payload that omits activities entirely', async () => {
    const dto = plainToInstance(UpdateSectionDto, { name: 'Cohorte Renombrada' });

    const errors = await validate(dto);

    expect(errors.find((e) => e.property === 'activities')).toBeUndefined();
  });

  it('still rejects an update payload with an out-of-bounds activity percentage', async () => {
    const dto = plainToInstance(UpdateSectionDto, {
      activities: [{ name: 'Parcial 1', percentage: 200 }],
    });

    const errors = await validate(dto, { validationError: { target: false } });

    expect(errors.find((e) => e.property === 'activities')).toBeDefined();
  });
});
