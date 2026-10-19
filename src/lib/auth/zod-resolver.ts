import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { z } from "zod";

/** Liga um schema do Zod ao React Hook Form (o mesmo que @hookform/resolvers, sem a dependência). */
export function zodResolver<T extends FieldValues>(
  schema: z.ZodType<T, FieldValues>,
): Resolver<T> {
  return async (values) => {
    const result = await schema.safeParseAsync(values);
    if (result.success) return { values: result.data, errors: {} };

    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      if (path && !errors[path])
        errors[path] = { type: issue.code, message: issue.message };
    }
    return { values: {}, errors: errors as FieldErrors<T> };
  };
}
