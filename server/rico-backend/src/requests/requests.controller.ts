import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { OptionalCustomerAuthGuard } from '../customers/customer-auth.guard';
import { CurrentCustomer } from '../common/decorators/current-customer.decorator';
import { CustomerDocument } from '../customers/schemas/customer.schema';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  // The app now asks the customer to log in before confirming, and sends a
  // bearer token — the request is then tied to a real account with a
  // verified email. The guard is the optional variant only so clients
  // already in users' hands, which post a bare name/phone with no token,
  // keep working; see OptionalCustomerAuthGuard.
  @UseGuards(OptionalCustomerAuthGuard)
  @Post()
  create(@Body() dto: CreateRequestDto, @CurrentCustomer() customer?: CustomerDocument) {
    return this.requestsService.create(dto, customer);
  }
}
