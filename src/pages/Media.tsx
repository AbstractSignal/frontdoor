import { useI18n } from '../i18n';

export default function Media() {
  const { t } = useI18n();
  return (
    <>
      <h1>{t('mediaLibrary')}</h1>
      <p className="placeholder">{t('mediaPlaceholder')}</p>
    </>
  );
}
