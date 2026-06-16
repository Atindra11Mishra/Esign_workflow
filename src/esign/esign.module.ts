import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DOCUSEAL_PROVIDER } from '../common/constants';
import { DocusealProvider } from './docuseal.provider';
import { MockEsignProvider } from './mock-esign.provider';

@Module({
  providers: [
    DocusealProvider,
    MockEsignProvider,
    {
      provide: DOCUSEAL_PROVIDER,
      inject: [ConfigService, DocusealProvider, MockEsignProvider],
      useFactory: (
        config: ConfigService,
        docuseal: DocusealProvider,
        mock: MockEsignProvider,
      ) => {
        const mockMode = config.get<string>('DOCUSEAL_MOCK_MODE', 'true') === 'true';
        const hasApiKey = Boolean(config.get<string>('DOCUSEAL_API_KEY'));
        return mockMode || !hasApiKey ? mock : docuseal;
      },
    },
  ],
  exports: [DOCUSEAL_PROVIDER],
})
export class EsignModule {}
