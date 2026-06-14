/**
 * QQ音乐Cookie设置页面
 */

import { useSettingValue } from '@/store/setting/hook';
import { updateSetting } from '@/core/common';
import InputItem from '../../components/InputItem';
import { createStyle, toast } from '@/utils/tools';
import { memo, useCallback } from 'react';
import { View } from 'react-native';
import { useI18n } from '@/lang';

export default memo(() => {
  const t = useI18n();
  const txCookie = useSettingValue('common.tx_cookie');

  const handleTxCookieChanged = useCallback(
    (text: string) => {
      // QQ音乐Cookie只需要保存，不需要同步到原生层
      updateSetting({ 'common.tx_cookie': text });
      if (text && text.length > 50) {
        toast(t('setting_basic_tx_cookie') + ' ' + t('saved'));
      }
    },
    [t],
  );

  return (
    <View style={styles.content}>
      <InputItem
        value={txCookie}
        label={t('setting_basic_tx_cookie')}
        onChanged={handleTxCookieChanged}
        placeholder={t('setting_basic_tx_cookie_placeholder')}
      />
    </View>
  );
});

const styles = createStyle({
  content: {
    // marginTop: 10,
  },
});
