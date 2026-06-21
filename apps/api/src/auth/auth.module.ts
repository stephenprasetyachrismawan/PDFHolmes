import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { JwtStrategy } from "./jwt.strategy";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [PassportModule, UsersModule],
  providers: [JwtStrategy, JwtAuthGuard],
  exports: [JwtAuthGuard, UsersModule],
})
export class AuthModule {}
