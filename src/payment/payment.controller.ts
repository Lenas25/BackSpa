import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Req,
  Res,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PaymentService } from './payment.service';
import { RegisterPaymentDto } from './dto/register-payment.dto';
import { Role } from 'src/common/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { AuthGuard } from 'src/auth/guard/auth.guard';

// Role-Based Access (spec: "payment-management" / "student-payments-view"
// domains; design's Authorization table — sdd/pagos/design): ADMIN has
// full read/write on every route below, ALUMNO has read-only access scoped
// to their own enrollment (PaymentService.findByEnrollment's ownership
// check), TUTOR is denied at EVERY payment endpoint — no route below lists
// Role.TUTOR in @Roles, so RolesGuard rejects tutors before the service is
// ever reached.
@Controller('payment')
@UseGuards(AuthGuard, RolesGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // Section Detail Pagos Tab (spec: "payment-management" domain) — admin
  // grid data source, flat list grouped client-side by enrollmentId.
  @Get('section/:id')
  @Roles(Role.ADMIN)
  async findBySection(
    @Param('id') id: number,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      const payments = await this.paymentService.findBySection(id);
      return response.status(200).json({
        message: 'Cuotas obtenidas correctamente',
        data: payments,
      });
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : 400;
      return response.status(status).json({
        message: 'Error al obtener las cuotas de la sección',
        error: e.message,
      });
    }
  }

  // Alumno Read-Only Mis Cuotas + Role-Based Access (spec:
  // "student-payments-view" domain). ALUMNO reads only their OWN
  // installments via PaymentService.findByEnrollment's ownership check;
  // ADMIN reads any enrollment.
  @Get('enrollment/:idEnrollment')
  @Roles(Role.ADMIN, Role.ALUMNO)
  async findByEnrollment(
    @Param('idEnrollment') idEnrollment: number,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      const payments = await this.paymentService.findByEnrollment(
        idEnrollment,
        request.user as never,
      );
      return response.status(200).json({
        message: 'Cuotas obtenidas correctamente',
        data: payments,
      });
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : 400;
      return response.status(status).json({
        message: 'Error al obtener las cuotas de la matrícula',
        error: e.message,
      });
    }
  }

  // Admin Payment Registration + Admin Payment Correction (spec:
  // "payment-management" domain) — single endpoint covers both per
  // design's "Pay vs unmark API" ADR.
  @Patch(':id')
  @Roles(Role.ADMIN)
  async pay(
    @Param('id') id: number,
    @Body() registerPaymentDto: RegisterPaymentDto,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      const payment = await this.paymentService.pay(id, registerPaymentDto);
      return response.status(200).json({
        message: 'Cuota registrada correctamente',
        data: payment,
      });
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : 400;
      return response.status(status).json({
        message: 'Error al registrar la cuota',
        error: e.message,
      });
    }
  }

  // Admin Payment Correction — "Revert to pending" scenario (spec:
  // "payment-management" domain).
  @Patch(':id/unmark')
  @Roles(Role.ADMIN)
  async unmark(
    @Param('id') id: number,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      const payment = await this.paymentService.unmark(id);
      return response.status(200).json({
        message: 'Cuota revertida a pendiente',
        data: payment,
      });
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : 400;
      return response.status(status).json({
        message: 'Error al revertir la cuota',
        error: e.message,
      });
    }
  }
}
