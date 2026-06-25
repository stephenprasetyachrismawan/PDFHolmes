import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { config } from "../config";
import { UsersService } from "../users/users.service";

// Guard standar: AuthGuard('cognito-jwt'). DEV bypass: header x-dev-user (email/sub).
@Injectable()
export class JwtAuthGuard extends AuthGuard("cognito-jwt") implements CanActivate {
  constructor(private readonly users: UsersService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (config.authDevBypass) {
      const req = context.switchToHttp().getRequest();
      // Header x-dev-user, atau query ?x-dev-user= (utk SSE EventSource).
      const devId =
        (req.headers["x-dev-user"] as string) ||
        (req.query?.["x-dev-user"] as string) ||
        "dev@pdfholmes.local";
      req.user = await this.users.syncFromClaims({
        sub: `dev-${devId}`,
        email: devId,
        name: "Dev User",
      });
      return true;
    }
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) throw new UnauthorizedException();
    return true;
  }
}
