import { Module } from "@nestjs/common";
import { AnalysesController } from "./analyses.controller";
import { AnalysesService } from "./analyses.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [AnalysesController],
  providers: [AnalysesService],
})
export class AnalysesModule {}
