import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { passportJwtSecret } from "jwks-rsa";
import { config } from "../config";
import { UsersService, type CognitoClaims } from "../users/users.service";
import type { DbUser } from "../db/schema";

// Verifikasi JWT Cognito (§11): signature via JWKS, cek iss/aud/exp.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "cognito-jwt") {
  constructor(private readonly users: UsersService) {
    super({
      // Header Bearer (default) ATAU query ?access_token= (utk SSE EventSource,
      // yang tak bisa kirim header kustom dari browser).
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter("access_token"),
      ]),
      ignoreExpiration: false,
      issuer: config.cognito.issuer,
      algorithms: ["RS256"],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksUri: config.cognito.jwksUrl,
      }),
    });
  }

  // Hasil validate jadi request.user — di sini sudah DbUser tersinkron.
  async validate(payload: CognitoClaims): Promise<DbUser> {
    if (!payload?.sub) throw new UnauthorizedException("token tanpa sub");
    return this.users.syncFromClaims(payload);
  }
}
