import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstitutionConfigService } from './institution-config.service';
import { InstitutionConfigController } from './institution-config.controller';
import { InstitutionConfig } from './entities/institution-config.entity';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([InstitutionConfig]), AuthModule],
  controllers: [InstitutionConfigController],
  providers: [InstitutionConfigService],
  exports: [TypeOrmModule, InstitutionConfigService],
})
export class InstitutionConfigModule {}
