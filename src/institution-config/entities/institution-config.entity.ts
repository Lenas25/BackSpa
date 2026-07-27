import { Column, Entity, PrimaryColumn } from 'typeorm';

// Single-row table: holds the institution-specific text used to render the
// "Constancia de Calificaciones" PDF (header, signatory, grade scale, etc.).
// There is no multi-tenant concept here — this is a FIXED-ID singleton: `id`
// is always 1, enforced at the DB layer via a plain (non-generated) primary
// key. This makes a second row impossible regardless of app-layer races (see
// InstitutionConfigService.get()/update(), which always target id: 1).
@Entity()
export class InstitutionConfig {
  @PrimaryColumn()
  id: number;

  @Column({ type: 'varchar' })
  academyName: string;

  // jsonb (NOT simple-array): header lines may contain commas, which would
  // corrupt TypeORM's simple-array comma-joined storage.
  @Column({ type: 'jsonb' })
  headerLines: string[];

  @Column({ type: 'varchar', default: '' })
  signatoryName: string;

  @Column({ type: 'varchar', default: '' })
  signatoryTitle: string;

  @Column({ type: 'varchar', default: '' })
  city: string;

  @Column({ type: 'varchar', default: '' })
  contactFooter: string;

  @Column({ type: 'text' })
  gradeScaleText: string;

  @Column({ type: 'int' })
  minApproving: number;

  @Column({ type: 'varchar' })
  approvedLabel: string;

  @Column({ type: 'varchar' })
  failedLabel: string;
}
