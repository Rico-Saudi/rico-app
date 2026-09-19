import { ValidationArguments, ValidationOptions, registerDecorator } from 'class-validator';
import { professionRegistry } from '../constants/professions.registry';

/**
 * Accepts only a trade the platform currently offers.
 *
 * Replaces the `@IsIn(PROFESSION_SLUGS)` this used to be. That captured the
 * array once, when the class was decorated at import time, so a trade the
 * owner added from the dashboard would have been rejected by validation
 * until the next deploy. This asks the registry at validation time instead.
 *
 * Deactivated trades still pass: a professional whose trade the owner
 * switched off keeps a valid profile and can still edit their card. Only a
 * deleted slug is unknown — and the delete route refuses while anyone is
 * still on it.
 */
export function IsKnownProfession(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isKnownProfession',
      target: object.constructor,
      propertyName,
      options: { message: 'profession_invalid', ...validationOptions },
      validator: {
        validate(value: unknown) {
          return professionRegistry.has(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a known profession slug`;
        },
      },
    });
  };
}
