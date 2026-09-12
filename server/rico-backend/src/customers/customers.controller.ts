import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { CustomersService, toProfile } from './customers.service';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { LoginCustomerDto } from './dto/login-customer.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { CustomerForgotPasswordDto } from './dto/forgot-password.dto';
import { CustomerResetPasswordDto } from './dto/reset-password.dto';
import { UpdateCustomerProfileDto } from './dto/update-profile.dto';
import { CustomerAuthGuard } from './customer-auth.guard';
import { CurrentCustomer, CustomerToken } from '../common/decorators/current-customer.decorator';
import { CustomerDocument } from './schemas/customer.schema';

// The app's own auth, mounted under /customer/auth so it can't be confused
// with /auth (the owner/vendor dashboards' cookie-session login).
@Controller('customer/auth')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // Returns only "a code was emailed" — never a session. The token comes
  // from /verify-email, once the address is proven.
  @Post('register')
  register(@Body() dto: RegisterCustomerDto) {
    return this.customersService.register(dto);
  }

  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyOtpDto) {
    return this.customersService.verifyEmail(dto.email, dto.code);
  }

  @Post('resend-otp')
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.customersService.resendOtp(dto.email, dto.purpose, dto.brand);
  }

  @Post('login')
  login(@Body() dto: LoginCustomerDto) {
    return this.customersService.login(dto.email, dto.password, dto.brand);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: CustomerForgotPasswordDto) {
    return this.customersService.forgotPassword(dto.email, dto.brand);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: CustomerResetPasswordDto) {
    return this.customersService.resetPassword(dto.email, dto.code, dto.password);
  }

  @UseGuards(CustomerAuthGuard)
  @Get('me')
  me(@CurrentCustomer() customer: CustomerDocument) {
    return toProfile(customer);
  }

  @UseGuards(CustomerAuthGuard)
  @Patch('me')
  updateProfile(@CurrentCustomer() customer: CustomerDocument, @Body() dto: UpdateCustomerProfileDto) {
    return this.customersService.updateProfile(customer, dto);
  }

  @UseGuards(CustomerAuthGuard)
  @Post('logout')
  logout(@CustomerToken() token: string) {
    return this.customersService.logout(token);
  }
}
