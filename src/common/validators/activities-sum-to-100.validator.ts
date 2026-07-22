import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Activity Percentage Validation (spec: "section-management" domain) —
// Section activities MUST sum to exactly 100%; the system MUST reject save
// when the sum differs. Applied to CreateSectionDto's `activities` field and
// inherited by UpdateSectionDto (PartialType only marks the field optional,
// it does not disable this constraint when the field IS present).
@ValidatorConstraint({ name: 'activitiesSumTo100', async: false })
export class ActivitiesSumTo100Constraint implements ValidatorConstraintInterface {
  validate(activities: unknown): boolean {
    if (!Array.isArray(activities) || activities.length === 0) {
      // Presence/shape is enforced separately by @IsArray()/@ValidateNested
      // on the same field; this constraint only concerns the percentage sum.
      return true;
    }

    const sum = activities.reduce((total: number, activity: unknown) => {
      const percentage = Number((activity as { percentage?: unknown })?.percentage);
      return total + (Number.isFinite(percentage) ? percentage : 0);
    }, 0);

    // Round to 2 decimals before comparing to avoid floating point drift
    // (e.g. 33.33 + 33.33 + 33.34 must equal exactly 100).
    return Math.round(sum * 100) / 100 === 100;
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'La suma de los porcentajes de las actividades debe ser exactamente 100';
  }
}

export function ActivitiesSumTo100(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: ActivitiesSumTo100Constraint,
    });
  };
}
