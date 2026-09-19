import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ProfessionalsService } from './professionals.service';
import { ProfessionsService } from './professions.service';
import { SearchProfessionalsDto } from './dto/search-professionals.dto';
import { CreateProfessionalRequestDto } from './dto/create-professional-request.dto';
import { MAX_CV_BYTES } from './constants/professional-card.constants';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { CurrentCustomer } from '../common/decorators/current-customer.decorator';
import { CustomerDocument } from '../customers/schemas/customer.schema';
import { toProfile } from '../customers/customers.service';

@Controller('professionals')
export class ProfessionalsController {
  constructor(
    private readonly professionalsService: ProfessionalsService,
    private readonly professionsService: ProfessionsService,
  ) {}

  // Public, like /search: finding out who is nearby is the whole product,
  // and the response carries no contact details to protect.
  @Get()
  search(@Query() query: SearchProfessionalsDto) {
    return this.professionalsService.search(query);
  }

  @Get('professions')
  listProfessions() {
    return this.professionsService.listProfessions();
  }

  // Public for the same reason as the card it belongs to: a customer
  // comparing two painters has to be able to open the CV one of them chose
  // to attach.
  //
  // Keyed by an unguessable token rather than a document id, so "public"
  // means "openable by whoever was shown the card" and not "enumerable by
  // anyone" — a CV carries a real person's name, address and sometimes more.
  // Replacing a CV mints a new token, so the bytes behind a URL never change
  // and it can be cached forever.
  @Get('cv/:token')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async getCv(@Param('token') token: string, @Res({ passthrough: true }) res: Response) {
    const cv = await this.professionalsService.findCv(token);
    res.set({
      'Content-Type': cv.contentType,
      'Content-Length': String(cv.size),
      // inline, not attachment: a PDF or a photo should open in the phone's
      // viewer from a chat thread, not land in Downloads.
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(cv.fileName)}`,
    });
    return new StreamableFile(cv.data);
  }

  // ---- The professional's own card -----------------------------------------
  // The text of the card is saved through PATCH /customer/auth/me, with the
  // rest of the profile. Only the file needs its own endpoints: it is
  // multipart, so it can't ride inside that JSON body.

  @UseGuards(CustomerAuthGuard)
  @Post('me/cv')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_CV_BYTES, files: 1 } }))
  async uploadCv(@CurrentCustomer() customer: CustomerDocument, @UploadedFile() file?: Express.Multer.File) {
    return toProfile(await this.professionalsService.setCv(customer, file));
  }

  @UseGuards(CustomerAuthGuard)
  @Delete('me/cv')
  async removeCv(@CurrentCustomer() customer: CustomerDocument) {
    return toProfile(await this.professionalsService.removeCv(customer));
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
