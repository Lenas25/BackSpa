import { Controller, Get, Post, Body, Patch, Param, Delete, Res, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { Response } from 'express';
import type { User } from './entities/user.entity';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { AuthGuard } from 'src/auth/guard/auth.guard';

@Controller('user')
@UseGuards(AuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Post()
  @Roles(Role.ADMIN)
  async create(@Body() createUserDto: CreateUserDto, @Res() response: Response): Promise<Response> {
    try {
      const newUser = await this.userService.create(createUserDto);
      return response.status(201).json({
        message: "Usuario creado",
        data: newUser,
      });
    } catch (error) {
      return response.status(400).json({
        message: "Error al crear el usuario",
        error: error.message,
      });
    }
  }

  @Get()
  @Roles(Role.ADMIN, Role.TUTOR)
  async findAll(@Res() response: Response): Promise<Response> {
    return response.status(200).json({
      message: "Usuarios obtenidos correctamente",
      data: await this.userService.findAll(),
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Res() response: Response): Promise<Response> {
    try {
      const user = await this.userService.findOne(id);
      return response.status(200).json({
        message: "Usuario obtenido",
        data: user,
      });
    } catch (error) {
      return response.status(400).json({
        message: "Error al obtener al usuario",
        error: error.message,
      });
    }
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @Res() response: Response): Promise<Response> {
    try {
      const userUpdated = await this.userService.update(id, updateUserDto);
      return response.status(200).json({
        message: "Usuario actualizado",
        data: userUpdated,
      });
    } catch (error) {
      return response.status(400).json({
        message: "Error al editar al usuario",
        error: error.message,
      });
    }
  }


  @Delete(':id')
  async remove(@Param('id') id: string, @Res() response: Response): Promise<Response> {
    try {
      const userDeleted = await this.userService.remove(id);
      return response.status(200).json({
        message: "Usuario eliminado",
        data: userDeleted,
      });
    } catch (error) {
      return response.status(400).json({
        message: "Error al eliminar al usuario",
        error: error.message,
      });
    }
  }
}
