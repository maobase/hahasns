/* ============================================================
   HeroUI v3 → v2 compatibility layer.

   @heroui/react@3 is a ground-up rewrite (react-aria-components based,
   compound dot-notation API, no Provider, no `color` prop, RAC value
   semantics). Rather than scatter the new compound JSX across a dozen
   page files, we adapt the small surface the app actually uses in ONE
   place. Every export below presents the familiar v2 prop API while
   rendering the real v3 primitives underneath.

   Covered: Card/CardBody/CardHeader, Tabs/Tab, Button, Input, Textarea,
   Select/SelectItem, Modal/ModalContent/ModalHeader/ModalBody/
   ModalFooter, useDisclosure, Chip, Spinner, Progress.
   (Avatar/Badge are rendered through the app's own components, not here.)
   ============================================================ */
import { Children, cloneElement, isValidElement } from 'react';
import {
  Card as V3Card,
  Tabs as V3Tabs,
  Button as V3Button,
  Input as V3Input,
  TextArea as V3TextArea,
  Select as V3Select,
  Modal as V3Modal,
  Chip as V3Chip,
  Spinner as V3Spinner,
  ProgressBar as V3ProgressBar,
  ListBox,
  Label,
  Description,
  useOverlayState,
} from '@heroui/react';

const cx = (...a) => a.filter(Boolean).join(' ');

// React.Children.toArray / map escape string keys to ".$<key>" (and encode
// ":" → "=0", "=" → "=2"). RAC needs the *original* key as its `id`, so we
// reverse that escaping to recover what the call site wrote as `key="…"`.
function unkey(k) {
  if (k == null) return k;
  let s = String(k);
  if (s.startsWith('.$')) s = s.slice(2);
  else if (s.startsWith('.')) s = s.slice(1); // index-based key fallback
  return s.replace(/=2/g, '=').replace(/=0/g, ':');
}

/* ---- variant mapping ------------------------------------------------ */
// v2 used `color` + `variant` (solid/flat/light/bordered/ghost). v3 folds
// both into a single `variant` enum:
// primary | secondary | tertiary | outline | ghost | danger | danger-soft.
function buttonVariant({ color, variant }) {
  if (color === 'danger' || color === 'success' || color === 'warning') {
    // status-colored buttons: solid danger maps to v3 danger, the rest
    // fall back to soft/secondary so they stay visible & on-brand.
    if (color === 'danger') return variant === 'flat' || variant === 'light' ? 'danger-soft' : 'danger';
  }
  switch (variant) {
    case 'bordered':
    case 'outline':
      return 'outline';
    case 'light':
    case 'ghost':
      return 'ghost';
    case 'flat':
      return color && color !== 'primary' ? 'secondary' : 'secondary';
    case 'solid':
    default:
      return 'primary';
  }
}

/* ---- Card ----------------------------------------------------------- */
// v3: <Card>…<Card.Content>. v2: <Card><CardBody>/<CardHeader>.
// v3 Card is a plain <div> wrapper (no `isPressable`, no React-component
// `as`). For the pressable/link cards the app builds, we render the link
// element (router <Link>, <a>, etc.) as the outer node and drop the Card
// chrome onto it via className, so the whole card stays clickable.
export function Card({ children, className, isPressable, as: As, to, href, ...rest }) {
  // Strip v2-only visual props v3 derives from its own variants.
  const { shadow, radius, ...domRest } = rest;
  const classes = cx('haha-card', isPressable && 'haha-card-pressable', className);

  if (As) {
    // Polymorphic link/element card (e.g. <Card as={Link} to=…>).
    const linkProps = { className: classes, ...domRest };
    if (to != null) linkProps.to = to;
    if (href != null) linkProps.href = href;
    return <As {...linkProps}>{children}</As>;
  }
  if (href != null) {
    return <a className={classes} href={href} {...domRest}>{children}</a>;
  }
  return <V3Card className={classes} {...domRest}>{children}</V3Card>;
}

export function CardBody({ children, className, ...rest }) {
  return <V3Card.Content className={cx('haha-card-body', className)} {...rest}>{children}</V3Card.Content>;
}

export function CardHeader({ children, className, ...rest }) {
  return <V3Card.Header className={cx('haha-card-header', className)} {...rest}>{children}</V3Card.Header>;
}

/* ---- Tabs / Tab ----------------------------------------------------- */
// v2: <Tabs selectedKey onSelectionChange><Tab key title>{panel}</Tab></Tabs>
// v3: <Tabs selectedKey onSelectionChange><Tabs.List><Tabs.Tab id>…</Tabs.Tab>
//      …</Tabs.List><Tabs.Panel id>{panel}</Tabs.Panel></Tabs>
export function Tab() {
  // Never rendered directly — Tabs reads its props. Present for import parity.
  return null;
}

export function Tabs({
  children,
  className,
  classNames,
  selectedKey,
  onSelectionChange,
  // v2 styling props with no v3 equivalent — accepted then dropped.
  color, variant, radius, size, fullWidth, 'aria-label': ariaLabel,
  ...rest
}) {
  const tabs = Children.toArray(children).filter(isValidElement);
  const hasPanels = tabs.some((t) => t.props.children != null);
  return (
    <V3Tabs
      aria-label={ariaLabel}
      className={cx('haha-tabs', fullWidth && 'haha-tabs-full', className, classNames?.base)}
      selectedKey={selectedKey}
      onSelectionChange={onSelectionChange}
      {...rest}
    >
      <V3Tabs.List className={cx('haha-tablist', classNames?.tabList)}>
        {tabs.map((t) => {
          const id = unkey(t.key);
          return (
            <V3Tabs.Tab key={id} id={id} className={classNames?.tab}>
              {t.props.title}
            </V3Tabs.Tab>
          );
        })}
      </V3Tabs.List>
      {hasPanels &&
        tabs.map((t) => {
          const id = unkey(t.key);
          return (
            <V3Tabs.Panel key={id} id={id}>
              {t.props.children}
            </V3Tabs.Panel>
          );
        })}
    </V3Tabs>
  );
}

/* ---- Button --------------------------------------------------------- */
// v2: color + variant + isLoading + startContent/endContent + onPress/onClick.
// v3 Button has no color/isLoading/startContent — we fold them in here.
export function Button({
  children,
  className,
  color,
  variant,
  size = 'md',
  radius,
  fullWidth,
  isLoading,
  isDisabled,
  startContent,
  endContent,
  onPress,
  onClick,
  as,
  to,
  href,
  type,
  ...rest
}) {
  const extra = {};
  if (as) extra.as = as;
  if (to != null) extra.to = to;
  if (href != null) extra.href = href;
  if (type) extra.type = type;
  // RAC Button fires onPress; keep onClick working too for the few call
  // sites that rely on native click (e.g. preventing link navigation).
  const handlePress = onPress;
  return (
    <V3Button
      className={cx('haha-btn', className)}
      variant={buttonVariant({ color, variant })}
      size={size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : 'md'}
      fullWidth={!!fullWidth}
      isDisabled={isDisabled || isLoading}
      onPress={handlePress}
      onClick={onClick}
      {...extra}
      {...rest}
    >
      {isLoading && <V3Spinner size="sm" className="haha-btn-spinner" />}
      {!isLoading && startContent}
      {children}
      {!isLoading && endContent}
    </V3Button>
  );
}

/* ---- Field wrapper (label + description for inputs) ------------------ */
function Field({ label, labelPlacement, description, className, children }) {
  if (!label && !description) return children;
  return (
    <div className={cx('haha-field', `haha-field-${labelPlacement || 'outside'}`, className)}>
      {label && <Label className="haha-field-label">{label}</Label>}
      {children}
      {description && <Description className="haha-field-desc">{description}</Description>}
    </div>
  );
}

/* ---- Input ---------------------------------------------------------- */
// v2 Input bundled label/startContent/endContent/onValueChange + DOM onChange.
// v3 Input is the bare field; we re-wrap to keep the v2 ergonomics.
export function Input({
  className,
  label,
  labelPlacement,
  description,
  variant, // bordered/etc → dropped (v3 has its own variant set)
  radius,
  startContent,
  endContent,
  value,
  onValueChange,
  onChange,
  isRequired,
  ...rest
}) {
  const handleChange = (e) => {
    onChange?.(e);
    onValueChange?.(e?.target?.value ?? '');
  };
  const field = (
    <div className={cx('haha-input-wrap', className)}>
      {startContent && <span className="haha-input-start">{startContent}</span>}
      <V3Input
        className="haha-input"
        value={value ?? ''}
        onChange={handleChange}
        required={isRequired}
        {...rest}
      />
      {endContent && <span className="haha-input-end">{endContent}</span>}
    </div>
  );
  return (
    <Field label={label} labelPlacement={labelPlacement} description={description}>
      {field}
    </Field>
  );
}

/* ---- Textarea ------------------------------------------------------- */
export function Textarea({
  className,
  label,
  labelPlacement,
  description,
  variant,
  radius,
  value,
  onValueChange,
  onChange,
  minRows,
  ...rest
}) {
  const handleChange = (e) => {
    onChange?.(e);
    onValueChange?.(e?.target?.value ?? '');
  };
  const field = (
    <V3TextArea
      className={cx('haha-textarea', className)}
      value={value ?? ''}
      onChange={handleChange}
      rows={minRows}
      {...rest}
    />
  );
  return (
    <Field label={label} labelPlacement={labelPlacement} description={description}>
      {field}
    </Field>
  );
}

/* ---- Select / SelectItem -------------------------------------------- */
// v2: <Select selectedKeys={[v]} onChange={e=>…}><SelectItem key>…</SelectItem>
// v3: compound <Select selectedKey onSelectionChange><Select.Trigger>…
//      <Select.Popover><ListBox><ListBox.Item id>…
export function SelectItem({ children }) {
  // Consumed by Select; never rendered directly.
  return children;
}

export function Select({
  className,
  label,
  labelPlacement,
  description,
  variant,
  radius,
  size,
  selectedKeys,
  onChange,
  onSelectionChange,
  children,
  'aria-label': ariaLabel,
  ...rest
}) {
  const items = Children.toArray(children).filter(isValidElement);
  const selected = Array.isArray(selectedKeys) ? selectedKeys[0] : selectedKeys;

  const handleSelection = (key) => {
    onSelectionChange?.(key);
    // emulate the v2 DOM-event onChange the app relies on
    onChange?.({ target: { value: key } });
  };

  const field = (
    <V3Select
      aria-label={ariaLabel || (typeof label === 'string' ? label : undefined)}
      className={cx('haha-select', className)}
      selectedKey={selected ?? null}
      onSelectionChange={handleSelection}
      {...rest}
    >
      <V3Select.Trigger className="haha-select-trigger">
        <V3Select.Value />
        <V3Select.Indicator />
      </V3Select.Trigger>
      <V3Select.Popover className="haha-select-popover">
        <ListBox>
          {items.map((it) => {
            const id = unkey(it.key);
            return (
              <ListBox.Item key={id} id={id} textValue={String(it.props.children)}>
                {it.props.children}
              </ListBox.Item>
            );
          })}
        </ListBox>
      </V3Select.Popover>
    </V3Select>
  );
  return (
    <Field label={label} labelPlacement={labelPlacement} description={description}>
      {field}
    </Field>
  );
}

/* ---- Modal stack + useDisclosure ------------------------------------ */
// v2: useDisclosure() → { isOpen, onOpen, onClose, onOpenChange }
// v3: useOverlayState() → { isOpen, open, close, setOpen, toggle }
export function useDisclosure(props) {
  const state = useOverlayState(props);
  return {
    isOpen: state.isOpen,
    onOpen: state.open,
    onClose: state.close,
    onOpenChange: state.setOpen,
    onToggle: state.toggle,
  };
}

// v2: <Modal isOpen onOpenChange placement backdrop size><ModalContent>
//      {(close)=> …}</ModalContent></Modal>
// v3: <Modal isOpen onOpenChange><Modal.Backdrop><Modal.Container>
//      <Modal.Dialog>{({close})=> …}</Modal.Dialog>…
// RAC's Dialog injects `{ close }` into a render-prop child, which lines up
// with the v2 `(close) => …` ModalContent render-prop once we unwrap it.
export function Modal({
  children,
  isOpen,
  onOpenChange,
  placement = 'center',
  size = 'md',
  backdrop, // blur/opaque → v3 backdrop variant
  ...rest
}) {
  // Pull the render-prop (or static node) out of the <ModalContent> child.
  let content = null;
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === ModalContent) content = child.props.children;
  });
  if (content == null) content = children;

  const dialogChildren =
    typeof content === 'function'
      ? ({ close }) => content(close) // adapt {close} → (close)
      : content;

  return (
    <V3Modal isOpen={isOpen} onOpenChange={onOpenChange} {...rest}>
      <V3Modal.Backdrop variant={backdrop === 'blur' ? 'blur' : undefined}>
        <V3Modal.Container placement={placement} size={size}>
          <V3Modal.Dialog className="haha-modal-dialog">{dialogChildren}</V3Modal.Dialog>
        </V3Modal.Container>
      </V3Modal.Backdrop>
    </V3Modal>
  );
}

// Marker component — its `children` (the `(close) => …` render-prop) is read
// by <Modal> above; it is never rendered on its own.
export function ModalContent() {
  return null;
}

export function ModalHeader({ children, className, ...rest }) {
  return <V3Modal.Header className={cx('haha-modal-header', className)} {...rest}>{children}</V3Modal.Header>;
}
export function ModalBody({ children, className, ...rest }) {
  return <V3Modal.Body className={cx('haha-modal-body', className)} {...rest}>{children}</V3Modal.Body>;
}
export function ModalFooter({ children, className, ...rest }) {
  return <V3Modal.Footer className={cx('haha-modal-footer', className)} {...rest}>{children}</V3Modal.Footer>;
}

/* ---- Chip ----------------------------------------------------------- */
// v3 Chip splits the old `color` prop into two axes:
//   color:   default | success | warning | danger   (status fills)
//   variant: primary | secondary | soft             (brand / shape)
// v2 callers pass a single `color` (primary/secondary/success/warning/
// danger/default) plus `variant="flat"`. Translate that here.
const CHIP_STATUS = { success: 'success', warning: 'warning', danger: 'danger' };
export function Chip({ children, className, color = 'default', variant = 'flat', size = 'sm', startContent, endContent, ...rest }) {
  let v3color = 'default';
  let v3variant = 'soft';
  if (CHIP_STATUS[color]) {
    // status color → solid `soft` fill in that hue (flat) or full color
    v3color = CHIP_STATUS[color];
    v3variant = variant === 'flat' || variant === 'soft' ? 'soft' : 'soft';
  } else if (color === 'primary') {
    v3variant = variant === 'flat' || variant === 'soft' ? 'soft' : 'primary';
    if (v3variant === 'soft') {
      // keep brand tint via our own class since `soft` is neutral-gray
      return brandChip({ children, className, size, startContent, endContent, rest });
    }
  } else if (color === 'secondary') {
    v3variant = 'secondary';
  }
  return (
    <V3Chip
      className={cx('haha-chip', className)}
      color={v3color}
      variant={v3variant}
      size={size}
      {...rest}
    >
      {startContent}
      {children}
      {endContent}
    </V3Chip>
  );
}

// A brand-tinted "flat primary" chip — v3 has no soft-primary color, so we
// render the neutral soft chip and recolor it to the active skin via CSS.
function brandChip({ children, className, size, startContent, endContent, rest }) {
  return (
    <V3Chip className={cx('haha-chip haha-chip-brand', className)} color="default" variant="soft" size={size} {...rest}>
      {startContent}
      {children}
      {endContent}
    </V3Chip>
  );
}

/* ---- Spinner -------------------------------------------------------- */
export function Spinner({ color, size = 'md', className, ...rest }) {
  return <V3Spinner className={cx('haha-spinner', className)} size={size} {...rest} />;
}

/* ---- Progress ------------------------------------------------------- */
// v2 <Progress value={0-100} color size aria-label /> → v3 ProgressBar
// (RAC meter-style: value 0-100, minValue/maxValue default 0-100).
export function Progress({ value = 0, color, size = 'md', className, 'aria-label': ariaLabel, ...rest }) {
  return (
    <V3ProgressBar
      aria-label={ariaLabel}
      className={cx('haha-progress', color === 'success' && 'haha-progress-success', className)}
      value={value}
      size={size}
      {...rest}
    >
      <V3ProgressBar.Track className="haha-progress-track">
        <V3ProgressBar.Fill className="haha-progress-fill" />
      </V3ProgressBar.Track>
    </V3ProgressBar>
  );
}

// Pass-throughs for any future direct v3 use.
export { useOverlayState };
