import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const UserId = createParamDecorator((data: unknown, ctx: ExecutionContext): string | undefined => {
  const req = ctx.switchToHttp().getRequest();
  return req.user?.sub as string | undefined;
});

