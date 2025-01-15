import { BadRequestException, Injectable, NotFoundException, Res } from '@nestjs/common';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import { Course } from 'src/course/entities/course.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { Enrollment } from './entities/enrollment.entity';

@Injectable()
export class EnrollmentService {
  constructor(
    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
  ) { }

  async findAll() {
    return await this.enrollmentRepository.find();
  }

  async findOneByUser(id: string) {
    try {
      const user = await this.userRepository.findOne({
        where: {
          id
        }
      });
      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }
      const enrollment = await this.enrollmentRepository.find({
        where: {
          user
        },
        relations: ['course', 'user']
      });
      if (!enrollment) {
        throw new NotFoundException('Matrícula no encontrada');
      }
      return enrollment;
    } catch (error) {
      throw new NotFoundException(error);
    }
  }

  async findOneByCourse(id: number) {
    try {
      const course = await this.courseRepository.findOne({
        where: {
          id
        }
      });
      if (!course) {
        throw new NotFoundException('Curso no encontrado');
      }
      const enrollment = await this.enrollmentRepository.find({
        where: {
          course
        }
      });
      if (!enrollment) {
        throw new NotFoundException('Matrícula no encontrada');
      }
      return enrollment;
    } catch (error) {
      throw new NotFoundException(error);
    }
  }

  async update(id: number, updateEnrollmentDto: UpdateEnrollmentDto) {
    console.log(updateEnrollmentDto);
    try {
      const course = await this.courseRepository.findOne({
        where: {
          id
        }
      });
      if (!course) {
        throw new NotFoundException('Curso no encontrado');
      }

      const currentEnrollments = await this.enrollmentRepository.find({
        where: { course },
        relations: ['user'],
      });

      const usersToAdd = updateEnrollmentDto.users.filter(
        (newUser) => !currentEnrollments.some((enrollment) => enrollment.user.id === newUser.id)
      );

      const enrollmentsToRemove = currentEnrollments.filter(
        (enrollment) => !updateEnrollmentDto.users.some((newUser) => newUser.id === enrollment.user.id)
      );

      for (const userToAdd of usersToAdd) {
        const user = await this.userRepository.findOne({
          where: {
            id: userToAdd.id
          }
        });

        if (user) {
          const newEnrollment = this.enrollmentRepository.create({
            ...updateEnrollmentDto,
            user,
            course,
            active: true
          });
          
          await this.enrollmentRepository.save(newEnrollment);
        }
      }

      for (const enrollmentToRemove of enrollmentsToRemove) {
        await this.enrollmentRepository.delete(enrollmentToRemove);
      }

      for (const enrollment of currentEnrollments) {
        if (updateEnrollmentDto.users.some((newUser) => newUser.id === enrollment.user.id)) {
          enrollment.active = true;
          await this.enrollmentRepository.save(enrollment);
        }
      }

      return await this.enrollmentRepository.find({
        where: {
          course
        }
      });
    } catch (error) {
      throw new BadRequestException(error);
    }
  }


  async finishCourse(id: number) {
    try {
      const course = await this.courseRepository.findOne({
        where: {
          id
        }
      });
      const enrollments = await this.enrollmentRepository.find({
        where: {
          active: true,
          course
        }
      });

      for (const enrollment of enrollments) {
        enrollment.active = false;
        await this.enrollmentRepository.save(enrollment);
      }

      course.isActive = false;
      await this.courseRepository.save(course);
      return enrollments;
    } catch (error) {
      throw new BadRequestException(error);
    }
  }


}