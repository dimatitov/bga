import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { FactionId } from '@bga/game-rebellion/schema';
import { type ReactNode, useEffect, useId, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { KeyButton, StatusBadge } from '@/shared/ui';
import { ForceGlyph } from '../../ui/ForceGlyph';
import { useCoreBoard } from '../model/coreContext';
import type { ManifestRequest } from '../model/coreUiStore';
import type { ForceGroup } from '../model/forces';
import {
  factionLabel,
  leaderLabel,
  regionLabel,
  systemLabel,
  unitTypeLabel,
} from '../panels/labels';
import { InspectorHeading } from './InspectorHeading';
import {
  groupKey,
  isGroupSelected,
  isSystemManifest,
  manifestOf,
  type ManifestVm,
} from './manifestModel';

const T = terminalTokens;
const NS = 'rebellion.manifest';

const FACTION_TONE: Readonly<Record<FactionId, 'red' | 'green'>> = {
  empire: 'red',
  rebels: 'green',
};
/** QD-8: faction-coloured TEXT uses the light text shades only. */
const FACTION_TEXT: Readonly<Record<FactionId, string>> = {
  empire: T.color.redText,
  rebels: T.color.phosphorText,
};

export interface UnitManifestProps {
  request: ManifestRequest;
  /** `rail` — inside the console rail; `sheet` — inside the mobile bottom sheet (< 760 px). */
  variant: 'rail' | 'sheet';
  onClose(): void;
  /** Hide the body (collapsed sheet): header and total stay. */
  collapsed?: boolean;
  /** Extra header control (the sheet toggle). */
  headerExtra?: ReactNode;
}

function Group({ vm, group }: { vm: ManifestVm; group: ForceGroup }) {
  const { t } = useTranslation();
  const selected = isGroupSelected(vm, group);
  const headingId = useId();
  return (
    <Box
      component="section"
      aria-labelledby={headingId}
      data-testid={`unit-manifest-group-${groupKey(group)}`}
      data-count={group.count}
      data-selected={selected ? 'true' : 'false'}
      sx={{
        py: '10px',
        borderBottom: `1px solid ${T.color.line}`,
        ...(selected && {
          borderLeft: `3px solid ${T.color.amber}`,
          pl: '10px',
          backgroundColor: T.selection.bg,
        }),
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '12px',
          mb: '6px',
        }}
      >
        <Typography
          id={headingId}
          component="h4"
          sx={{
            m: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: T.type.body.size,
            fontWeight: 400,
            color: FACTION_TEXT[group.owner],
          }}
        >
          <ForceGlyph owner={group.owner} kind={group.arena} />
          {factionLabel(t, group.owner)} · {t(`${NS}:arena.${group.arena}`)}
          {selected && (
            <Box component="span" sx={{ color: T.color.amberText, fontSize: T.type.meta.size }}>
              · {t(`${NS}:groupSelected`)}
            </Box>
          )}
        </Typography>
        <Typography component="span" sx={{ fontSize: T.type.small.size, color: T.color.paper }}>
          {t(`${NS}:units`, { count: group.count })}
        </Typography>
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {group.types.map((row) => (
          <Box
            component="li"
            key={row.typeKey}
            data-testid={`unit-manifest-row-${group.owner}-${row.typeKey}`}
            data-count={row.count}
            sx={{
              py: '5px',
              borderBottom: `1px solid ${T.color.line}`,
              '&:last-of-type': { borderBottom: 0 },
              fontSize: T.type.small.size,
              color: T.color.paper,
            }}
          >
            {t(`${NS}:row`, { name: unitTypeLabel(t, row.typeKey), count: row.count })}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/**
 * Unit Manifest (SWR-009 MF, AC-7, AC-8): the forces of the selected system — or of the hidden rebel-base zone — from
 * the server view only: groups side × arena with «type × N» rows, leaders, total. The zone variant is `restricted`:
 * dashed frame, «access restricted · base location unknown», and NO system / region name, id or aria (§3.5 (d)).
 * «Close» calls `onClose` (closes the manifest; the caller returns the focus).
 */
export function UnitManifest({
  request,
  variant,
  onClose,
  collapsed = false,
  headerExtra,
}: UnitManifestProps) {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const vm = useMemo(() => manifestOf(view, request), [view, request]);
  const rootRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Opened from a DOM marker (now unmounted) the focus fell to <body>: bring it into the manifest.
  useEffect(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) rootRef.current?.focus();
  }, []);

  if (vm === null) return null;
  const restricted = vm.state === 'restricted';
  const system = isSystemManifest(vm) ? vm : null;

  // Rail: compact header (≈ 64 px) so the groups get the capped inspector cell; the sheet has room for the full one.
  const compact = variant === 'rail';
  const heading = system ? (
    <InspectorHeading
      id={titleId}
      compact={compact}
      name={systemLabel(t, view, system.target.systemId)}
      sub={regionLabel(t, view, system.regionId)}
    />
  ) : (
    <InspectorHeading
      id={titleId}
      compact={compact}
      name={t(`${NS}:restricted.heading`)}
      tone="paper"
    />
  );
  const chips =
    vm.factions.length > 0 || system?.isBase === true ? (
      <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {vm.factions.map((f) => (
          <StatusBadge
            key={f}
            tone={FACTION_TONE[f]}
            data-faction={f}
            sx={compact ? { py: '1px', px: '6px' } : undefined}
          >
            {factionLabel(t, f)}
          </StatusBadge>
        ))}
        {system?.isBase === true && (
          <StatusBadge tone="amber" sx={compact ? { py: '1px', px: '6px' } : undefined}>
            {t(`${NS}:base`)}
          </StatusBadge>
        )}
      </Box>
    ) : null;

  return (
    <Box
      component="section"
      ref={rootRef}
      tabIndex={-1}
      aria-labelledby={titleId}
      data-testid="unit-manifest"
      {...(system ? { 'data-system-id': system.target.systemId } : { 'data-zone': 'hidden' })}
      data-restricted={restricted ? 'true' : 'false'}
      data-state={vm.state}
      data-arenas={vm.arenas.join(',')}
      data-total={vm.total}
      data-variant={variant}
      sx={{
        border: `${T.bezel.module}px ${restricted ? 'dashed' : 'solid'} ${T.color.bezel}`,
        backgroundColor: T.color.module,
        boxShadow: `inset 0 0 0 1px ${T.module.inset}`,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        // The group list scrolls inside (fits a capped rail cell / the sheet); header and Close stay visible.
        overflow: 'hidden',
        height: variant === 'sheet' ? '100%' : undefined,
        maxHeight: '100%',
        outline: 'none',
        '&:focus-visible': {
          outline: `${T.focus.width}px solid ${T.focus.color}`,
          outlineOffset: -2,
        },
      }}
    >
      {headerExtra}
      <Box
        hidden={collapsed}
        sx={{
          display: collapsed ? 'none' : 'flex',
          flexDirection: 'column',
          minHeight: 0,
          flex: 1,
        }}
      >
        <Box
          data-testid="unit-manifest-header"
          sx={{
            display: 'grid',
            gap: compact ? '2px' : '8px',
            padding: compact ? '4px 10px 6px' : '10px 12px',
            borderBottom: `1px solid ${T.module.headBorder}`,
            backgroundColor: T.color.moduleHead,
            flex: 'none',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <Typography variant="meta" component="p" sx={{ m: 0 }}>
              {t(`${NS}:label`)}
            </Typography>
            <KeyButton
              size="small"
              data-testid="unit-manifest-close"
              aria-label={t(`${NS}:closeLabel`)}
              onClick={onClose}
              sx={
                compact
                  ? {
                      minHeight: 26,
                      py: '2px',
                      px: '10px',
                      '@media (pointer: coarse)': { minHeight: 44 },
                    }
                  : undefined
              }
            >
              {t(`${NS}:close`)}
            </KeyButton>
          </Box>
          {compact ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '4px 10px',
                flexWrap: 'wrap',
              }}
            >
              {heading}
              {chips}
            </Box>
          ) : (
            <>
              {heading}
              {chips}
            </>
          )}
        </Box>
        <Box
          data-testid="unit-manifest-body"
          sx={{ padding: '0 12px 10px', overflowY: 'auto', minHeight: 0, flex: 1 }}
        >
          {restricted && (
            <Box
              role="note"
              sx={{
                mt: '10px',
                border: `1px dashed ${T.color.bezelLight}`,
                backgroundColor: T.color.panel,
                padding: '10px',
                fontSize: T.type.small.size,
                color: T.color.warm,
              }}
            >
              <Box component="strong" sx={{ display: 'block', color: T.color.amber, mb: '4px' }}>
                {t(`${NS}:restricted.title`)}
              </Box>
              {t(`${NS}:restricted.note`)}
            </Box>
          )}
          {vm.groups.map((g) => (
            <Group key={groupKey(g)} vm={vm} group={g} />
          ))}
          {vm.leaders.length > 0 && (
            <Box sx={{ py: '10px', borderBottom: `1px solid ${T.color.line}` }}>
              <Typography variant="meta" component="h4" sx={{ m: 0, mb: '4px' }}>
                {t(`${NS}:leaders`)}
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {vm.leaders.map((l) => (
                  <Box
                    component="li"
                    key={l.id}
                    data-testid={`unit-manifest-leader-${l.id}`}
                    data-owner={l.owner}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      py: '5px',
                      fontSize: T.type.small.size,
                      color: T.color.paper,
                    }}
                  >
                    <ForceGlyph owner={l.owner} kind="leader" />
                    {t(`${NS}:leader`, { name: leaderLabel(t, l.id) })} · {factionLabel(t, l.owner)}
                  </Box>
                ))}
              </Box>
            </Box>
          )}
          {vm.state === 'empty' && (
            <Box
              sx={{
                mt: '10px',
                border: `1px dashed ${T.color.bezelLight}`,
                padding: '14px',
                textAlign: 'center',
                fontSize: T.type.small.size,
                color: T.color.warm,
              }}
            >
              {t(`${NS}:empty`)}
            </Box>
          )}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              pt: '10px',
              fontSize: T.type.small.size,
              color: T.color.warm,
            }}
          >
            <span>{t(`${NS}:total`)}</span>
            <Box
              component="strong"
              data-testid="unit-manifest-total"
              sx={{ fontSize: 17, color: T.color.phosphor }}
            >
              {vm.total}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
