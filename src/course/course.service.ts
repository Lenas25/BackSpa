import { Injectable } from '@nestjs/common';
import type { CreateCourseDto } from './dto/create-course.dto';
import type { UpdateCourseDto } from './dto/update-course.dto';
import { Course } from './entities/course.entity';
import type { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Activity } from 'src/activity/entities/activity.entity';

@Injectable()
export class CourseService {

  constructor(
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(Activity)
    private activityRepository: Repository<Activity>,
  ) { }

  async create(createCourseDto: CreateCourseDto) {
    try {
      const newCourse = this.courseRepository.create(createCourseDto);
      await this.courseRepository.save(newCourse);
      if (createCourseDto.activities && createCourseDto.activities.length > 0) {
        const activities = createCourseDto.activities.map(activityDto => {
          const activity = this.activityRepository.create(activityDto);
          activity.course = newCourse;
          return activity;
        });
        await this.activityRepository.save(activities);
      }
      return newCourse;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async findAll() {
    return await this.courseRepository.find({ relations: ['activities'] });
  }

  async findOne(id: number) {
    try {
      return await this.courseRepository.findOne({
        where: {
          id,
        },
        relations: ['activities'],
      });
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async update(id: number, updateCourseDto: UpdateCourseDto) {
    try {
      const course = await this.courseRepository.findOne({ where: { id } });
      if (!course) {
        throw new Error('No se encontró el curso');
      }
      const { activities: _, ...courseData } = updateCourseDto;
      Object.assign(course, courseData);
      await this.courseRepository.save(course);
      const existingActivities = await this.activityRepository.find({ where: { course } });
      if (updateCourseDto.activities && updateCourseDto.activities.length > 0) {
        const updateActivityIds = updateCourseDto.activities.map(activity => activity.id).filter(id => id !== undefined);
        const deleteActivities = existingActivities.filter(activity => !updateActivityIds.includes(activity.id));
        await this.activityRepository.remove(deleteActivities);

        const activities = await Promise.all(updateCourseDto.activities.map(async activityDto => {
          const { new: _, ...activityData } = activityDto;
          if (activityDto.new) {
            const newActivity = this.activityRepository.create(activityData);
            newActivity.course = course;
            return this.activityRepository.save(newActivity);
          }
          const existingActivity = await this.activityRepository.findOne({
            where: {
              id: activityDto.id,
            },
          });
          if (existingActivity) {
            Object.assign(existingActivity, activityData);
            return this.activityRepository.save(existingActivity);
          }
        }));
      }
      const updatedCourse  = await this.courseRepository.findOne({ where: { id }, relations: ['activities'] });
      return updatedCourse;
    } catch (error) {
      throw new Error(`Error actualizando el curso: ${error}`);
    }
  }

  async remove(id: number) {
    try {
      const detail = await this.courseRepository.delete(id);
      if (detail.affected === 0) {
        throw new Error("No se pudo eliminar el curso");
      }
      return detail;
    } catch (error) {
      throw new Error(error.message);
    }
  }
}
