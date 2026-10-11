import type {
  DomainConstraintValidator,
  DomainConstraintValidationContext,
  DomainConstraintValidationResult,
  ConstraintIssue,
} from "./validate-constraints";
import { registerDomainValidator } from "./validate-constraints";

/**
 * Domain-specific constraint validator for the "event-planning" domain.
 *
 * Implements:
 * 1. Venue capacity versus expected attendance (taking session count into account).
 * 2. Minimum accessibility requirements.
 */
export const eventPlanningValidator: DomainConstraintValidator = {
  id: "event-planning-capacity-accessibility",
  description:
    "Validates venue capacity against expected attendance and minimum accessibility requirements for event-planning domain.",
  validate(context: DomainConstraintValidationContext): DomainConstraintValidationResult {
    const plan = context.candidatePlan;
    const constraints = {
      ...plan.constraints,
      ...(context.constraintOverrides ?? {}),
    };
    const issues: ConstraintIssue[] = [];
    let passed = true;

    // 1. Capacity & Attendance Validation
    if (
      constraints.expectedAttendance !== undefined &&
      constraints.expectedAttendance > 0
    ) {
      let maxDeclaredCapacity = 0;
      let foundCapacityField = false;
      let sessions = 1;

      for (const t of plan.tasks) {
        if (t.outputs && typeof t.outputs.capacity === "number") {
          foundCapacityField = true;
          if (t.outputs.capacity > maxDeclaredCapacity) {
            maxDeclaredCapacity = t.outputs.capacity;
          }
        }
        if (t.outputs && typeof t.outputs.sessionCount === "number") {
          sessions = Math.max(1, t.outputs.sessionCount);
        }
      }

      if (foundCapacityField) {
        const requiredPerSession = Math.ceil(
          constraints.expectedAttendance / sessions
        );
        if (maxDeclaredCapacity < requiredPerSession) {
          passed = false;
          issues.push({
            code: "CAPACITY_INSUFFICIENT",
            severity: "error",
            message: `Declared venue capacity (${maxDeclaredCapacity}) is insufficient for expected attendance (${constraints.expectedAttendance} across ${sessions} session(s) = ${requiredPerSession} required).`,
            suggestedAction:
              "Select a larger venue or split the event into multiple sessions.",
          });
        }
      }
    }

    // 2. Minimum Accessibility Validation
    if (constraints.minimumAccessibility === true) {
      let foundAccessibleField = false;
      let isAccessible = false;

      for (const t of plan.tasks) {
        if (t.outputs && typeof t.outputs.accessible === "boolean") {
          foundAccessibleField = true;
          if (t.outputs.accessible) {
            isAccessible = true;
          }
        }
      }

      if (foundAccessibleField && !isAccessible) {
        passed = false;
        issues.push({
          code: "ACCESSIBILITY_NOT_MET",
          severity: "error",
          message:
            "Venue does not satisfy the declared minimumAccessibility requirement.",
          suggestedAction:
            "Select an accessible venue or update accessibility arrangements.",
        });
      }
    }

    return {
      passed,
      issues,
      details: {
        capacityChecked: constraints.expectedAttendance !== undefined,
        accessibilityChecked: constraints.minimumAccessibility !== undefined,
      },
    };
  },
};

// Register for the "event-planning" domain
registerDomainValidator("event-planning", eventPlanningValidator);

export function registerEventPlanningValidator(): void {
  registerDomainValidator("event-planning", eventPlanningValidator);
}
