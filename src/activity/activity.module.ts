import { forwardRef, Module } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';
import { Activity } from './entities/activity.entity';
import { SectionModule } from 'src/section/section.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SectionService } from 'src/section/section.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Activity]), AuthModule, forwardRef(() => SectionModule)],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [TypeOrmModule, ActivityService],
})
export class ActivityModule {}
