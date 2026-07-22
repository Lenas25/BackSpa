import { Injectable } from '@nestjs/common';
import type { CreateSectionDto } from './dto/create-section.dto';
import type { UpdateSectionDto } from './dto/update-section.dto';
import { Section } from './entities/section.entity';
import type { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Activity } from 'src/activity/entities/activity.entity';
import { User } from 'src/user/entities/user.entity';
import { Course } from 'src/course/entities/course.entity';

@Injectable()
export class SectionService {

  constructor(
    @InjectRepository(Section)
    private sectionRepository: Repository<Section>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(Activity)
    private activityRepository: Repository<Activity>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) { }

  async create(createSectionDto: CreateSectionDto) {
    try {
      const course = await this.courseRepository.findOne({ where: { id: createSectionDto.id_course } });
      if (!course) {
        throw new Error('No se encontró el curso padre');
      }
      let tutor: User | null = null;
      if (createSectionDto.id_tutor) {
        tutor = await this.userRepository.findOne({ where: { id: createSectionDto.id_tutor } });
        if (!tutor) {
          throw new Error('No se encontró el tutor');
        }
      }
      const { id_tutor: _idTutor, id_course: _idCourse, ...sectionData } = createSectionDto;
      const newSection = this.sectionRepository.create({
        ...sectionData,
        course,
        tutor,
      });
      await this.sectionRepository.save(newSection);
      if (createSectionDto.activities && createSectionDto.activities.length > 0) {
        const activities = createSectionDto.activities.map(activityDto => {
          const activity = this.activityRepository.create(activityDto);
          activity.section = newSection;
          return activity;
        });
        await this.activityRepository.save(activities);
      }
      return newSection;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async findAll() {
    return await this.sectionRepository.find({ relations: ['activities', 'tutor', 'course'] });
  }

  async findOne(id: number) {
    try {
      return await this.sectionRepository.findOne({
        where: {
          id,
        },
        relations: ['activities', 'tutor', 'course'],
      });
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async update(id: number, updateSectionDto: UpdateSectionDto) {
    try {
      const section = await this.sectionRepository.findOne({ where: { id } });
      if (!section) {
        throw new Error('No se encontró la sección');
      }
      const { activities: _activities, id_tutor, id_course, ...sectionData } = updateSectionDto;
      Object.assign(section, sectionData);
      if (id_tutor) {
        const tutor = await this.userRepository.findOne({ where: { id: id_tutor } });
        if (!tutor) {
          throw new Error('No se encontró el tutor');
        }
        section.tutor = tutor;
      }
      if (id_course) {
        const course = await this.courseRepository.findOne({ where: { id: id_course } });
        if (!course) {
          throw new Error('No se encontró el curso padre');
        }
        section.course = course;
      }
      await this.sectionRepository.save(section);
      return await this.sectionRepository.findOne({ where: { id }, relations: ['activities', 'tutor', 'course'] });
    } catch (error) {
      throw new Error(`Error actualizando la sección: ${error}`);
    }
  }

  async remove(id: number) {
    try {
      const detail = await this.sectionRepository.delete(id);
      if (detail.affected === 0) {
        throw new Error("No se pudo eliminar la sección");
      }
      return detail;
    } catch (error) {
      throw new Error(error.message);
    }
  }
}
