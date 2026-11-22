import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme, type SxProps, type Theme } from '@mui/material/styles';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { terminalTokens, type TerminalColorRole } from '@/shared/theme';
import {
  CounterMarker,
  KeyButton,
  Led,
  LegendKey,
  Readout,
  StatusBadge,
  StatusCard,
  TerminalModule,
  UnitGlyph,
  type GlyphShape,
  type LedState,
} from '@/shared/ui/terminal';
import { UI_KIT_NS } from './i18n';

const T = terminalTokens;
const C = T.color;
const K = T.key;

/** Section ids mirror the UI Kit prototype anchors, so QA can screenshot «prototype ↔ app» pairs per section. */
const SECTIONS = [
  'palette',
  'type',
  'controls',
  'signals',
  'panels',
  'dialogs',
  'markers',
  'legend',
] as const;
type SectionId = (typeof SECTIONS)[number];

/** The 12 palette roles of the prototype (`#palette`), in its order. */
const PALETTE: readonly TerminalColorRole[] = [
  'crt',
  'display',
  'route',
  'region',
  'signal',
  'phosphor',
  'amber',
  'red',
  'case',
  'bezel',
  'warm',
  'paper',
];

const TYPE_ROWS = [
  { key: 'display', variant: 'h1', scale: T.type.display },
  { key: 'title', variant: 'h2', scale: T.type.title },
  { key: 'body', variant: 'body1', scale: T.type.body },
  { key: 'metric', variant: 'metric', scale: T.type.metric },
  { key: 'meta', variant: 'meta', scale: T.type.meta },
] as const;

const LEDS: readonly LedState[] = ['green', 'amber', 'red', 'off'];

/** Fixed sample glyph codes (shape × filled), not a game roster. */
const GLYPH_SAMPLES: ReadonlyArray<{
  key: string;
  shape: GlyphShape;
  filled: boolean;
  color: string;
  stroke?: string;
  dashed?: boolean;
}> = [
  { key: 'filledTriangle', shape: 'triangle', filled: true, color: C.red },
  { key: 'outlinedTriangle', shape: 'triangle', filled: false, color: C.phosphor },
  { key: 'filledSquare', shape: 'square', filled: true, color: C.red },
  { key: 'outlinedSquare', shape: 'square', filled: false, color: C.phosphor },
  { key: 'diamond', shape: 'diamond', filled: false, color: C.warm, stroke: C.amber },
  { key: 'circle', shape: 'circle', filled: false, color: C.warm },
  { key: 'dashed', shape: 'circle', filled: false, color: C.phosphor, dashed: true },
  { key: 'ring', shape: 'circle', filled: false, color: C.amber },
];

const gridSx = (min: number): SxProps<Theme> => ({
  display: 'grid',
  gap: `${T.space.module}px`,
  gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`,
  alignItems: 'start',
});

function Section({
  id,
  title,
  sectionId,
  note,
  children,
}: {
  id: SectionId;
  title: string;
  sectionId: string;
  note?: string;
  children: ReactNode;
}) {
  const headingId = `ui-kit-heading-${id}`;
  return (
    <Box
      component="section"
      id={id}
      aria-labelledby={headingId}
      data-testid={`ui-kit-section-${id}`}
      sx={{ pt: 3, scrollMarginTop: 16 }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 2,
          flexWrap: 'wrap',
          borderBottom: `1px solid ${C.line}`,
          pb: 1,
          mb: 1.5,
        }}
      >
        <Typography variant="meta" component="span">
          {sectionId}
        </Typography>
        <Typography id={headingId} variant="h2" component="h2" sx={{ m: 0 }}>
          {title}
        </Typography>
      </Box>
      {note && (
        <Typography variant="body2" sx={{ color: C.warm, mb: 1.5 }}>
          {note}
        </Typography>
      )}
      {children}
    </Box>
  );
}

/** Caption over a sample (UI Kit `.sample-label`). */
function SampleLabel({ children }: { children: ReactNode }) {
  return (
    <Typography variant="meta" component="span" sx={{ display: 'block', mb: 0.75 }}>
      {children}
    </Typography>
  );
}

/**
 * `/dev/ui-kit` — dev-only UI Kit showcase (SWR-009 S, A-7, AC-15). Built only from the shared UI Kit components
 * (`shared/ui/terminal`) and the MUI theme; captions come from its own `devUiKit` namespace. Sample values are neutral
 * placeholders, never game data. Hover / pressed / focus are pinned on dedicated keys for screenshot comparison.
 */
export function UiKitPage() {
  const { t } = useTranslation(UI_KIT_NS);
  const theme = useTheme();
  const uid = useId();
  const [tab, setTab] = useState(0);
  const [selectValue, setSelectValue] = useState('a');
  const [switchOn, setSwitchOn] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const tabKeys = ['first', 'second', 'third'] as const;
  // The inline dialog preview reuses the theme's own Dialog paper override (no restated values).
  const dialogPaperSx = theme.components?.MuiDialog?.styleOverrides?.paper as
    SxProps<Theme> | undefined;

  const sectionProps = (id: SectionId) => ({
    id,
    sectionId: t(`section.${id}.id`),
    title: t(`section.${id}.title`),
  });

  return (
    <Box
      data-testid="ui-kit-page"
      sx={{ px: 2, py: { xs: 2, md: 4 }, mx: 'auto', width: '100%', maxWidth: 1200, minWidth: 0 }}
    >
      <Box component="header" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Typography variant="h1" component="h1" sx={{ m: 0 }}>
          {t('title')}
        </Typography>
        <StatusBadge tone="amber" data-testid="ui-kit-badge">
          {t('devBadge')}
        </StatusBadge>
      </Box>
      <Typography variant="body2" sx={{ color: C.warm }}>
        {t('intro')}
      </Typography>

      <Box
        component="nav"
        aria-label={t('navLabel')}
        data-testid="ui-kit-nav"
        sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}
      >
        {SECTIONS.map((id) => (
          <KeyButton key={id} size="small" href={`#${id}`}>
            {t(`section.${id}.title`)}
          </KeyButton>
        ))}
      </Box>

      {/* 01 — palette */}
      <Section {...sectionProps('palette')} note={t('section.palette.note')}>
        <Box sx={gridSx(220)}>
          {PALETTE.map((role) => (
            <Box
              key={role}
              data-testid={`ui-kit-swatch-${role}`}
              data-color={C[role]}
              sx={{ border: `1px solid ${C.bezel}`, backgroundColor: C.panel }}
            >
              <Box aria-hidden="true" sx={{ height: 56, backgroundColor: C[role] }} />
              <Box sx={{ p: 1.25, display: 'grid', gap: 0.25 }}>
                <Typography variant="meta" component="span">
                  {t(`palette.${role}`)}
                </Typography>
                <Typography variant="body2" component="strong" sx={{ fontWeight: 700 }}>
                  {role}
                </Typography>
                <Typography variant="body2" component="code" sx={{ color: C.warm }}>
                  {C[role]}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Section>

      {/* 02 — type scale */}
      <Section {...sectionProps('type')} note={t('section.type.note')}>
        <TerminalModule
          label={t('type.module')}
          headingLevel="h3"
          actions={<Typography variant="meta">{T.font.face}</Typography>}
        >
          {TYPE_ROWS.map(({ key, variant, scale }) => (
            <Box
              key={key}
              data-testid={`ui-kit-type-${key}`}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '180px 1fr 120px' },
                gap: 1.5,
                alignItems: 'baseline',
                py: 1.25,
                borderBottom: `1px solid ${C.line}`,
                '&:last-of-type': { borderBottom: 0 },
              }}
            >
              <Typography variant="meta" component="span">
                {t(`type.${key}.role`)}
              </Typography>
              <Typography variant={variant} component="span" sx={{ m: 0 }}>
                {t(`type.${key}.example`)}
              </Typography>
              <Typography variant="meta" component="span">
                {`${scale.size} / ${scale.lineHeight} · ${scale.weight}`}
              </Typography>
            </Box>
          ))}
        </TerminalModule>
      </Section>

      {/* 03 — keys, fields, switches */}
      <Section {...sectionProps('controls')} note={t('section.controls.note')}>
        <Box sx={gridSx(220)} data-testid="ui-kit-keys">
          <Box>
            <SampleLabel>{t('keys.normal.state')}</SampleLabel>
            <KeyButton data-testid="ui-kit-key-normal">{t('keys.normal.label')}</KeyButton>
          </Box>
          <Box>
            <SampleLabel>{t('keys.hover.state')}</SampleLabel>
            <KeyButton
              data-testid="ui-kit-key-hover"
              sx={{ backgroundColor: K.hover.bg, borderColor: K.hover.border }}
            >
              {t('keys.hover.label')}
            </KeyButton>
          </Box>
          <Box>
            <SampleLabel>{t('keys.primary.state')}</SampleLabel>
            <KeyButton tone="primary" led="green" data-testid="ui-kit-key-primary">
              {t('keys.primary.label')}
            </KeyButton>
          </Box>
          <Box>
            <SampleLabel>{t('keys.selected.state')}</SampleLabel>
            <KeyButton selected data-testid="ui-kit-key-selected">
              {t('keys.selected.label')}
            </KeyButton>
          </Box>
          <Box>
            <SampleLabel>{t('keys.pressed.state')}</SampleLabel>
            <KeyButton
              data-testid="ui-kit-key-pressed"
              sx={{ backgroundColor: K.pressed.bg, boxShadow: K.pressed.shadow }}
            >
              {t('keys.pressed.label')}
            </KeyButton>
          </Box>
          <Box>
            <SampleLabel>{t('keys.disabled.state')}</SampleLabel>
            <KeyButton disabled data-testid="ui-kit-key-disabled">
              {t('keys.disabled.label')}
            </KeyButton>
          </Box>
          <Box>
            <SampleLabel>{t('keys.warning.state')}</SampleLabel>
            <KeyButton tone="warning" led="amber" data-testid="ui-kit-key-warning">
              {t('keys.warning.label')}
            </KeyButton>
          </Box>
          <Box>
            <SampleLabel>{t('keys.danger.state')}</SampleLabel>
            <KeyButton tone="danger" data-testid="ui-kit-key-danger">
              {t('keys.danger.label')}
            </KeyButton>
          </Box>
          <Box>
            <SampleLabel>{t('keys.focus.state')}</SampleLabel>
            {/* `Mui-focusVisible` is the class the theme's focus ring targets (D-A-5). */}
            <KeyButton className="Mui-focusVisible" data-testid="ui-kit-key-focus">
              {t('keys.focus.label')}
            </KeyButton>
          </Box>
        </Box>

        <TerminalModule label={t('fields.module')} headingLevel="h3" sx={{ mt: 2 }}>
          <Box sx={gridSx(220)}>
            <TextField
              label={t('fields.input')}
              defaultValue={t('fields.inputValue')}
              slotProps={{ htmlInput: { 'data-testid': 'ui-kit-input' } }}
            />
            <TextField
              select
              label={t('fields.select')}
              value={selectValue}
              onChange={(e) => setSelectValue(e.target.value)}
              data-testid="ui-kit-select"
            >
              <MenuItem value="a">{t('fields.optionA')}</MenuItem>
              <MenuItem value="b">{t('fields.optionB')}</MenuItem>
            </TextField>
            <Box>
              <SampleLabel>{t('fields.switchGroup')}</SampleLabel>
              <FormControlLabel
                control={
                  <Switch
                    checked={switchOn}
                    onChange={(e) => setSwitchOn(e.target.checked)}
                    slotProps={{ input: { 'data-testid': 'ui-kit-switch' } as object }}
                  />
                }
                label={t('fields.switch')}
              />
            </Box>
          </Box>
        </TerminalModule>
      </Section>

      {/* 04 — LEDs, AI status, save badges */}
      <Section {...sectionProps('signals')}>
        <Box sx={gridSx(420)}>
          <TerminalModule label={t('leds.module')} headingLevel="h3">
            <Box
              component="ul"
              sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 2.5 }}
            >
              {LEDS.map((state) => (
                <Box
                  component="li"
                  key={state}
                  data-testid={`ui-kit-led-${state}`}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  <Led state={state} />
                  <Box>
                    <Typography component="b" sx={{ display: 'block', fontWeight: 700 }}>
                      {t(`leds.${state}.label`)}
                    </Typography>
                    <Typography variant="meta" component="small">
                      {t(`leds.${state}.note`)}
                    </Typography>
                  </Box>
                </Box>
              ))}
              <Box
                component="li"
                data-testid="ui-kit-led-blink"
                sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <Led state="amber" blink />
                <Box>
                  <Typography component="b" sx={{ display: 'block', fontWeight: 700 }}>
                    {t('leds.blink.label')}
                  </Typography>
                  <Typography variant="meta" component="small">
                    {t('leds.blink.note')}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </TerminalModule>
          <TerminalModule label={t('status.module')} headingLevel="h3">
            <Box sx={gridSx(160)}>
              <StatusCard
                tone="green"
                icon={<Led state="green" />}
                title={t('status.ready.title')}
                data-testid="ui-kit-status-ready"
              >
                {t('status.ready.text')}
              </StatusCard>
              <StatusCard
                tone="amber"
                icon={<Led state="amber" blink />}
                title={t('status.thinking.title')}
                data-testid="ui-kit-status-thinking"
              >
                {t('status.thinking.text')}
              </StatusCard>
              <StatusCard
                tone="red"
                icon={<Led state="red" />}
                title={t('status.failed.title')}
                data-testid="ui-kit-status-failed"
              >
                {t('status.failed.text')}
              </StatusCard>
            </Box>
            <Box
              data-testid="ui-kit-badges"
              sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}
            >
              <StatusBadge tone="green">✓ {t('status.saved')}</StatusBadge>
              <StatusBadge tone="amber">◌ {t('status.saving')}</StatusBadge>
              <StatusBadge tone="red">! {t('status.saveError')}</StatusBadge>
              <StatusBadge tone="neutral">{t('status.neutral')}</StatusBadge>
            </Box>
          </TerminalModule>
        </Box>
      </Section>

      {/* 05 — tabs, modules, log */}
      <Section {...sectionProps('panels')}>
        <Box sx={gridSx(420)}>
          <Box
            data-testid="ui-kit-tabs"
            sx={{ border: `${T.bezel.module}px solid ${C.bezel}`, backgroundColor: C.module }}
          >
            <Tabs
              value={tab}
              onChange={(_, v: number) => setTab(v)}
              aria-label={t('tabs.label')}
              variant="fullWidth"
            >
              {tabKeys.map((key, i) => (
                <Tab
                  key={key}
                  label={t(`tabs.${key}`)}
                  id={`${uid}-tab-${i}`}
                  aria-controls={`${uid}-panel`}
                />
              ))}
            </Tabs>
            <Box
              role="tabpanel"
              id={`${uid}-panel`}
              aria-labelledby={`${uid}-tab-${tab}`}
              sx={{ p: `${T.space.module}px` }}
            >
              <Typography variant="body2">
                {t('tabs.panel', { tab: t(`tabs.${tabKeys[tab]}`) })}
              </Typography>
            </Box>
          </Box>
          <TerminalModule
            label={t('log.module')}
            headingLevel="h3"
            dense
            data-testid="ui-kit-log"
            actions={<StatusBadge tone="red">{t('log.badge')}</StatusBadge>}
          >
            <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {[3, 2, 1].map((n) => (
                <Box
                  component="li"
                  key={n}
                  data-testid={`ui-kit-log-entry-${n}`}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '44px 1fr auto',
                    gap: 1,
                    alignItems: 'center',
                    py: 0.75,
                    borderBottom: `1px solid ${C.line}`,
                    '&:last-of-type': { borderBottom: 0 },
                  }}
                >
                  <Typography variant="meta" component="span">
                    {`#${String(n).padStart(2, '0')}`}
                  </Typography>
                  <Typography variant="body2" component="span">
                    {t('log.entry', { n })}
                  </Typography>
                  <StatusBadge tone="red">{t('log.badge')}</StatusBadge>
                </Box>
              ))}
            </Box>
          </TerminalModule>
        </Box>
        <Box sx={[gridSx(260), { mt: 1.5 }] as SxProps<Theme>}>
          <TerminalModule
            label={t('modules.default')}
            headingLevel="h3"
            actions={<StatusBadge tone="green">{t('sample')}</StatusBadge>}
          >
            <Typography variant="body2">{t('modules.defaultBody')}</Typography>
          </TerminalModule>
          <TerminalModule
            label={t('modules.restricted')}
            headingLevel="h3"
            tone="restricted"
            actions={<StatusBadge tone="amber">{t('sample')}</StatusBadge>}
          >
            <Typography variant="body2">{t('modules.restrictedBody')}</Typography>
          </TerminalModule>
          <TerminalModule label={t('modules.readout')} headingLevel="h3">
            <Readout label={t('modules.readoutLabel')} value="01 / 10" valueVariant="metric" />
          </TerminalModule>
        </Box>
      </Section>

      {/* 06 — dialog, alerts */}
      <Section {...sectionProps('dialogs')}>
        <Box sx={gridSx(420)}>
          <Box>
            <SampleLabel>{t('dialog.preview')}</SampleLabel>
            <Box
              role="group"
              aria-labelledby={`${uid}-dialog-title`}
              data-testid="ui-kit-dialog-preview"
              sx={
                [
                  { display: 'flex', flexDirection: 'column' },
                  dialogPaperSx ?? {},
                ] as SxProps<Theme>
              }
            >
              <DialogTitle id={`${uid}-dialog-title`} component="p">
                {t('dialog.title')}
              </DialogTitle>
              <DialogContent>
                <DialogContentText>{t('dialog.body')}</DialogContentText>
              </DialogContent>
              <DialogActions>
                <KeyButton>{t('dialog.cancel')}</KeyButton>
                <KeyButton tone="warning" led="amber">
                  {t('dialog.confirm')}
                </KeyButton>
              </DialogActions>
            </Box>
            <KeyButton
              sx={{ mt: 1.5 }}
              onClick={() => setDialogOpen(true)}
              data-testid="ui-kit-dialog-open"
            >
              {t('dialog.open')}
            </KeyButton>
          </Box>
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            <Alert severity="info" data-testid="ui-kit-alert-info">
              <AlertTitle>{t('alerts.info.title')}</AlertTitle>
              {t('alerts.info.text')}
            </Alert>
            <Alert severity="warning" data-testid="ui-kit-alert-warning">
              <AlertTitle>{t('alerts.warning.title')}</AlertTitle>
              {t('alerts.warning.text')}
            </Alert>
            <Alert severity="error" data-testid="ui-kit-alert-error">
              <AlertTitle>{t('alerts.error.title')}</AlertTitle>
              {t('alerts.error.text')}
              <Box sx={{ mt: 1 }}>
                <KeyButton tone="warning" size="small">
                  {t('alerts.error.action')}
                </KeyButton>
              </Box>
            </Alert>
          </Box>
        </Box>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          aria-labelledby={`${uid}-modal-title`}
          aria-describedby={`${uid}-modal-body`}
          data-testid="ui-kit-dialog"
        >
          <DialogTitle id={`${uid}-modal-title`}>{t('dialog.title')}</DialogTitle>
          <DialogContent>
            <DialogContentText id={`${uid}-modal-body`}>{t('dialog.body')}</DialogContentText>
          </DialogContent>
          <DialogActions>
            <KeyButton autoFocus onClick={() => setDialogOpen(false)}>
              {t('dialog.cancel')}
            </KeyButton>
            <KeyButton tone="warning" led="amber" onClick={() => setDialogOpen(false)}>
              {t('dialog.confirm')}
            </KeyButton>
          </DialogActions>
        </Dialog>
      </Section>

      {/* 07 — counter markers, glyphs */}
      <Section {...sectionProps('markers')} note={t('section.markers.note')}>
        <Box sx={gridSx(420)}>
          <TerminalModule label={t('markers.module')} headingLevel="h3">
            <Box data-testid="ui-kit-markers" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              {GLYPH_SAMPLES.slice(0, 4).map((g, i) => (
                <CounterMarker
                  key={g.key}
                  glyph={{ shape: g.shape, filled: g.filled, color: g.color }}
                  count={i + 1}
                  pressed={false}
                  aria-label={t(`markers.${g.key}`, { count: i + 1 })}
                  data-testid={`ui-kit-marker-${g.key}`}
                />
              ))}
              <CounterMarker
                glyph={{ shape: 'triangle', filled: false, color: C.phosphor }}
                count={2}
                pressed
                aria-label={t('markers.pressed', { count: 2 })}
                data-testid="ui-kit-marker-pressed"
              />
            </Box>
          </TerminalModule>
          <TerminalModule label={t('markers.glyphs')} headingLevel="h3">
            <Box
              data-testid="ui-kit-glyphs"
              sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}
            >
              {GLYPH_SAMPLES.map((g) => (
                <UnitGlyph
                  key={g.key}
                  shape={g.shape}
                  filled={g.filled}
                  color={g.color}
                  stroke={g.stroke}
                  dashed={g.dashed}
                  size={28}
                />
              ))}
            </Box>
          </TerminalModule>
        </Box>
      </Section>

      {/* 08 — legend keys */}
      <Section {...sectionProps('legend')}>
        <TerminalModule label={t('legend.module')} headingLevel="h3">
          <Box
            data-testid="ui-kit-legend"
            sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}
          >
            {GLYPH_SAMPLES.map((g) => (
              <LegendKey
                key={g.key}
                data-testid={`ui-kit-legend-${g.key}`}
                glyph={
                  <UnitGlyph
                    shape={g.shape}
                    filled={g.filled}
                    color={g.color}
                    stroke={g.stroke}
                    dashed={g.dashed}
                  />
                }
              >
                {t(`legend.${g.key}`)}
              </LegendKey>
            ))}
          </Box>
        </TerminalModule>
      </Section>
    </Box>
  );
}
