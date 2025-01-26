import { forwardRef, Module } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';
import { Activity } from './entities/activity.entity';
import { CourseModule } from 'src/course/course.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseService } from 'src/course/course.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Activity]), AuthModule, forwardRef(() => CourseModule)],  
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [TypeOrmModule, ActivityService],
})
export class ActivityModule {}
