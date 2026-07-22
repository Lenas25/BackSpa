import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { Activity } from './entities/activity.entity';
import { Repository } from 'typeorm';
import { Section } from 'src/section/entities/section.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityDto } from './dto/activity.dto';

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(Section)
    private readonly sectionRepository: Repository<Section>,
  ) { }

  async findOne(id: number) {
    try {
      const section = await this.sectionRepository.findOne({
        where: {
          id
        },
        relations: ['activities']
      })

      if (!section) {
        throw new NotFoundException('Actividades relacionadas a sección no encontrada');
      }
      return section.activities;
    } catch (error) {
      throw new NotFoundException(error);
    }
  }

  async update(id: number, updateActivityDto: ActivityDto) {
    try {
      const activity = await this.activityRepository.findOne({
        where: {
          id
        }
      });
      if (!activity) {
        throw new NotFoundException('Actividad no encontrada');
      }
      await this.activityRepository.update(id, updateActivityDto);
      return await this.activityRepository.findOne({
        where: {
          id
        }
      });
    } catch (error) {
      throw new BadRequestException(error);
    }
  }

  async remove(id: number) {
    try {
      const activity = await this.activityRepository.findOne({
        where: {
          id
        }
      });
      if (!activity) {
        throw new NotFoundException('Actividad no encontrada');
      }
      await this.activityRepository.remove(activity);
      return {
        message: "Actividad eliminada"
      }
    } catch (error) {
      throw new BadRequestException(error);
    }
  }
}
