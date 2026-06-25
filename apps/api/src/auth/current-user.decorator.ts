import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { DbUser } from "../db/schema";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DbUser => {
    return ctx.switchToHttp().getRequest().user as DbUser;
  },
);
