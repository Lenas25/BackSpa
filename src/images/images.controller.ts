import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFile, Res, UseGuards } from '@nestjs/common';
import { ImagesService } from './images.service';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { v2 as cloduinary } from 'cloudinary';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';

const storage = new CloudinaryStorage({
  cloudinary: cloduinary,
});

@Controller('images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post('upload')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TUTOR)
  @UseInterceptors(FileInterceptor('file', { storage }))
  async uploadImage(@UploadedFile() file:Express.Multer.File, @Res() res:Response):Promise<Response> {
    try{
      return res.status(201).json({imageUrl: file.path});
    }catch(error){
      return res.status(500).json({error: 'Failed to upload image'});
    }
  }

  @Get()
  async findAll() {
    return await this.imagesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Res() res:Response):Promise<Response> {
    try{
      const imageUrl =  await this.imagesService.findOne(id);
      return res.status(201).json({imageUrl});
    }catch(error){
      return res.status(500).json({error: 'Failed to find image'});
    }
  }

  @Delete(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async remove(@Param('id') id: string, @Res() res:Response):Promise<Response> {
    try{
      await this.imagesService.remove(id);
      return res.status(201).json({message:"Image deleted successfully", deleted: true});
    }catch(error){
      return res.status(500).json({error: 'Failed to delete image', deleted:false});
    }
  }
}
