import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ProfessionalsService } from './professionals.service';
import { SearchProfessionalsDto } from './dto/search-professionals.dto';
import { CreateProfessionalRequestDto } from './dto/create-professional-request.dto';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { CurrentCustomer } from '../common/decorators/current-customer.decorator';
import { CustomerDocument } from '../customers/schemas/customer.schema';

@Controller('professionals')
export class ProfessionalsController {
  constructor(private readonly professionalsService: ProfessionalsService) {}

  // Public, like /search: finding out who is nearby is the whole product,
  // and the response carries no contact details to protect.
  @Get()
  search(@Query() query: SearchProfessionalsDto) {
    return this.professionalsService.search(query);
  }

  @Get('professions')
  listProfessions() {
    return this.professionalsService.listProfessions();
  }

  // Authenticated: the professional is called back on the number attached
  // to a verified account, so an anonymous request has nothing to deliver.
  @UseGuards(CustomerAuthGuard)
  @Post('requests')
  @HttpCode(HttpStatus.OK)
  createRequest(@Body() dto: CreateProfessionalRequestDto, @CurrentCustomer() customer: CustomerDocument) {
    return this.professionalsService.createRequest(dto, customer, dto.brand);
  }

  // The other side of the same account: leads sent *to* me.
  @UseGuards(CustomerAuthGuard)
  @Get('requests/incoming')
  listIncoming(@CurrentCustomer() customer: CustomerDocument) {
    return this.professionalsService.listIncoming(customer._id);
  }

  @UseGuards(CustomerAuthGuard)
  @Patch('requests/:id/handled')
  markHandled(@Param('id') id: string, @CurrentCustomer() customer: CustomerDocument) {
    return this.professionalsService.markHandled(id, customer._id);
  }
}
