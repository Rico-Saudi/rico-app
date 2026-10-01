import { Controller, Get, Query } from '@nestjs/common';
import { WeatherService } from './weather.service';
import { WeatherQueryDto } from './dto/weather-query.dto';
import { suggestionFor } from './weather.constants';
import { brandFor } from '../common/constants/brands';

@Controller()
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  /// GET /weather?lat=&lng=&brand=
  ///
  /// Current conditions plus what Rico would offer to look for because of
  /// them. Always 200: with no key, a failed upstream, or weather too ordinary
  /// to act on, `weather` and `suggestion` come back null and the app simply
  /// shows its usual screen.
  @Get('weather')
  async current(@Query() query: WeatherQueryDto) {
    const snapshot = await this.weatherService.getFor(query.lat, query.lng);
    if (!snapshot) return { weather: null, suggestion: null };

    const dialect = brandFor(query.brand).dialect;
    return {
      weather: {
        tempC: Math.round(snapshot.tempC),
        condition: snapshot.condition,
        bucket: snapshot.bucket,
        notable: snapshot.notable,
        descriptionAr: snapshot.descriptionAr,
      },
      // Only offered when the weather actually suggests something. Mild
      // weather returns null rather than a limp "maybe a restaurant?".
      suggestion: suggestionFor(snapshot.bucket, dialect),
    };
  }
}
