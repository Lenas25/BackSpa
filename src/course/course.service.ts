import { ConflictException, Injectable } from '@nestjs/common';
import type { CreateCourseDto } from './dto/create-course.dto';
import type { UpdateCourseDto } from './dto/update-course.dto';
import { Course } from './entities/course.entity';
import { Section } from 'src/section/entities/section.entity';
import type { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class CourseService {

  constructor(
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(Section)
    private sectionRepository: Repository<Section>,
  ) { }

  async create(createCourseDto: CreateCourseDto) {
    try {
      const newCourse = this.courseRepository.create(createCourseDto);
      await this.courseRepository.save(newCourse);
      return newCourse;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  // Public catalog endpoint: MUST only expose Course fields (name,
  // description, image) — never Section internals (dates, tutor,
  // activities). Do NOT load the `sections` relation here.
  async findAll() {
    return await this.courseRepository.find();
  }

  async findOne(id: number) {
    try {
      return await this.courseRepository.findOne({
        where: {
          id,
        },
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
      Object.assign(course, updateCourseDto);
      await this.courseRepository.save(course);
      return course;
    } catch (error) {
      throw new Error(`Error actualizando el curso: ${error}`);
    }
  }

  // Course Deletion Guard: a parent Course with one or more Sections MUST
  // NOT be deletable. Checked BEFORE the try/catch below so the 409 status
  // is not swallowed and rewrapped as a generic error.
  async remove(id: number) {
    const sectionsCount = await this.sectionRepository.count({ where: { course: { id } } });
    if (sectionsCount > 0) {
      throw new ConflictException(
        'No se puede eliminar el curso porque tiene secciones asociadas',
      );
    }

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
