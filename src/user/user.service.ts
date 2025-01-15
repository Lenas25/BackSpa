import { BadRequestException, Injectable } from '@nestjs/common';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { Twilio } from 'twilio';

@Injectable()
export class UserService {

  private readonly client: Twilio;
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    this.client = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
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

      // await this.client.messages.create({
      //   body: `Hola ${createUserDto.name}, tus credenciales para acceder a la intranet de la Academia Alejandra son:
      // \nUsuario: ${createUserDto.username}
      // \nContraseña: ${createUserDto.password}`,
      //   from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      //   to: `whatsapp:${createUserDto.phone}`,
      // });

      createUserDto.password = bcrypt.hashSync(createUserDto.password, 10);
      return await this.userRepository.save(createUserDto);
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async findAll() {
    return await this.userRepository.find();
  }

  async findOne(id: string) {
    try {
      return await this.userRepository.findOne({
        where: {
          id,
        },
      });
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    try {
      if (updateUserDto.password) {
       const isHashed = updateUserDto.password.startsWith('$2a$') || updateUserDto.password.startsWith('$2b$') || updateUserDto.password.startsWith('$2y$') || updateUserDto.password.startsWith('$2x$');
       if (!isHashed) {
         updateUserDto.password = bcrypt.hashSync(updateUserDto.password, 10);
       }
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
