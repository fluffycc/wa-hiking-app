import { describe, expect, it } from 'vitest'
import { deriveConditions, type NOAAForecastPeriod } from '../../api/shared/conditionsEngine'

const snowForecast: NOAAForecastPeriod[] = [
  {
    name: 'Today',
    temperature: 34,
    temperatureUnit: 'F',
    shortForecast: 'Rain And Snow',
    detailedForecast: 'Rain and snow in the mountains.',
    windSpeed: '5 mph',
  },
  {
    name: 'Tonight',
    temperature: 31,
    temperatureUnit: 'F',
    shortForecast: 'Chance Snow',
    detailedForecast: 'Chance of snow.',
    windSpeed: '5 mph',
  },
  {
    name: 'Tomorrow',
    temperature: 42,
    temperatureUnit: 'F',
    shortForecast: 'Mostly Cloudy',
    detailedForecast: 'Mostly cloudy.',
    windSpeed: '5 mph',
  },
]

describe('deriveConditions', () => {
  it('does not apply high-elevation regional snow to low trails', () => {
    const result = deriveConditions(snowForecast, 1050, 2400, 3500)
    expect(result.snow).toBe('none')
  })

  it('keeps snow caution for trails in the forecast snow band', () => {
    const result = deriveConditions(snowForecast, 3600, 5200, 3500)
    expect(result.snow).toBe('significant')
    expect(result.overall).toBe('caution')
  })
})
