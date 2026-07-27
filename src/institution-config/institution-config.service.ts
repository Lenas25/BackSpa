import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { InstitutionConfig } from './entities/institution-config.entity';
import { UpdateInstitutionConfigDto } from './dto/update-institution-config.dto';

// Fixed id for the single InstitutionConfig row. The entity's primary key is
// a plain (non-generated) column, and the migration seeds exactly one row
// with this id, so the DB itself makes a second row impossible — see
// InstitutionConfig entity and CreateInstitutionConfig migration.
const SINGLETON_ID = 1;

// Seed defaults for the single InstitutionConfig row — used the first time
// get()/update() runs against an empty table. Kept in one place so update()
// can reuse the exact same defaults get() would create.
const DEFAULT_CONFIG: Omit<InstitutionConfig, 'id'> = {
  academyName: 'Alejandra Academia de Belleza',
  headerLines: [
    'República Bolivariana de Venezuela',
    'Ministerio del Poder Popular para la Educación',
    'Alejandra Academia de Belleza',
  ],
  signatoryName: '',
  signatoryTitle: 'Directora',
  city: '',
  contactFooter: '',
  gradeScaleText:
    'Los resultados se interpretan en la escala numérica del 0 al 20; la calificación mínima aprobatoria es 11.',
  minApproving: 11,
  approvedLabel: 'APROBADO',
  failedLabel: 'DESAPROBADO',
};

@Injectable()
export class InstitutionConfigService {
  constructor(
    @InjectRepository(InstitutionConfig)
    private readonly institutionConfigRepository: Repository<InstitutionConfig>,
  ) {}

  // Ensure-default / upsert-on-read: this is a fixed-id singleton table, so
  // "get" always targets the row with id = SINGLETON_ID. If it doesn't exist
  // yet (fresh install), it is created here with the seed defaults.
  //
  // Concurrency note: two concurrent first-reads can both see "missing" and
  // both attempt to insert id = SINGLETON_ID. The DB-level primary key
  // guarantees only one insert wins; the loser's save() rejects with a
  // duplicate-key QueryFailedError, which we catch here and resolve by
  // simply re-reading the row the winner just created. This is what makes
  // get()/update() deterministic — no duplicate rows are ever possible, and
  // both concurrent callers converge on the same row.
  async get(): Promise<InstitutionConfig> {
    const existing = await this.institutionConfigRepository.findOne({
      where: { id: SINGLETON_ID },
    });
    if (existing) {
      return existing;
    }

    const created = this.institutionConfigRepository.create({
      ...DEFAULT_CONFIG,
      id: SINGLETON_ID,
    });

    try {
      return await this.institutionConfigRepository.save(created);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        // Lost the insert race to a concurrent first-read — the singleton
        // row now exists, so just return it.
        const winner = await this.institutionConfigRepository.findOne({
          where: { id: SINGLETON_ID },
        });
        if (winner) {
          return winner;
        }
      }
      throw error;
    }
  }

  // Applies a partial update to the single config row (id = SINGLETON_ID),
  // creating it from defaults first (via get()) if it doesn't exist yet.
  async update(
    updateInstitutionConfigDto: UpdateInstitutionConfigDto,
  ): Promise<InstitutionConfig> {
    const config = await this.get();
    Object.assign(config, updateInstitutionConfigDto);
    return this.institutionConfigRepository.save(config);
  }
}
