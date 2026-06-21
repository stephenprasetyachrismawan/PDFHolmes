import { Module, type Provider } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { JwtStrategy } from "./jwt.strategy";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { UsersModule } from "../users/users.module";
import { config } from "../config";

// JwtStrategy butuh JWKS Cognito. Saat AUTH_DEV_BYPASS=true (tanpa AWS),
// jangan daftarkan strategy — guard memakai jalur bypass header x-dev-user.
const strategyProviders: Provider[] = config.authDevBypass ? [] : [JwtStrategy];

@Module({
  imports: [PassportModule, UsersModule],
  providers: [...strategyProviders, JwtAuthGuard],
  exports: [JwtAuthGuard, UsersModule],
})
export class AuthModule {}
