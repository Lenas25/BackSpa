import { BadRequestException, Injectable } from '@nestjs/common';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { Twilio } from 'twilio';
import { Course } from 'src/course/entities/course.entity';

@Injectable()
export class UserService {

  private readonly client: Twilio;
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
  }

  async create(createUserDto: CreateUserDto) {
    try {
      const newUser = await this.userRepository.findOne({
        where: {
          username: createUserDto.username,
        },
      });
      if (newUser) {
        throw new BadRequestException("El usuario ya existe");
      }

      createUserDto.password = bcrypt.hashSync(createUserDto.password, 10);
      return await this.userRepository.save(createUserDto);
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async findAll() {
    return await this.userRepository.find({
      relations: ["courses"],
    });
  }

  async findOne(id: string) {
    try {
      const user = await this.userRepository.findOne({
        where: {
          id,
        },
        relations: ["courses"],
      });
      if (!user) {
        throw new Error("No se encontro el usuario");
      }
      const { ...userWithoutIdCourse } = user;
      return userWithoutIdCourse;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    try {
      const user = await this.userRepository.findOne({
        where: {
          id,
        },
      });
      if (updateUserDto.password) {
        updateUserDto.password = bcrypt.hashSync(updateUserDto.password, 10);
      } else {
        updateUserDto.password = user.password;
      }
      const detail = await this.userRepository.update(id, updateUserDto);
      if (detail.affected === 0) {
        throw new Error("No se encontro el usuario");
      }
      return detail;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async remove(id: string) {
    try {
      const detail = await this.userRepository.delete(id);
      if (detail.affected === 0) {
        throw new Error("No se pudo eliminar el usuario");
      }
      return detail;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async findByUsername(username: string) {
    return await this.userRepository.findOne({
      where: {
        username,
      },
    });
  }

}
