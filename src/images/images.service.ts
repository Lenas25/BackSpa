import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateImageDto } from './dto/create-image.dto';
import { UpdateImageDto } from './dto/update-image.dto';
import { ConfigService } from '@nestjs/config';
import {v2 as cloudinary} from 'cloudinary';

@Injectable()
export class ImagesService {

  constructor(private configService:ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET')
    });
  }

  async findAll():Promise<string[]> {
    try{
      const result = await cloudinary.api.resources();
      return result.resources.map((image) => image.url);
    }catch(error){
      throw new HttpException('Failed to list images', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findOne(publicId: string):Promise<string> {
    try{
      const result = await cloudinary.api.resource(publicId);
      return result.secure_url;
    }catch(error){
      throw new HttpException('Image not found', HttpStatus.NOT_FOUND);
    }
  }
  
  async remove(publicId: string):Promise<boolean> {
    try{
      await cloudinary.uploader.destroy(publicId);
      return true;
    }catch(error){
      throw new HttpException('Failed to delete image', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
