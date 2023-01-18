import {Annotation, AnnotationView} from "models/annotations/annotation"
import {BasicTickFormatter} from "models/formatters/basic_tick_formatter"
import * as mixins from "core/property_mixins"
import * as visuals from "core/visuals"
import * as p from "core/properties"
import {Context2d} from "core/util/canvas"
import {GraphicsBoxes, GraphicsBox, BaseExpo, TextBox} from "core/graphics"
import {Color} from "core/types"
import {Enum} from "core/kinds"
import {Scale} from "models/scales/scale"
import {BBox} from "core/util/bbox"
import {wgs84_mercator} from "core/util/projections"
import {TextAlign} from "core/enums"



const SI_PREFIX: any = {
    '0': '', '1': 'da', '2': 'h', '3': 'k', '6': 'M', '9': 'G',
    '12': 'T', '15': 'P', '18': 'E', '21': 'Z', '24': 'Y',
    '-1': 'd', '-2': 'c', '-3': 'm', '-6': 'μ', '-9': 'n',
    '-12': 'p', '-15': 'f', '-18': 'a', '-21': 'z', '-24': 'y'
}

const IMPERIAL_UNITS: any = {
  'in': {'m': 0.0254, 'ft': 1/12},
  'ft': {'m': 0.3048, 'ft': 1},
  'mi': {'m': 1609.344, 'ft': 5280}
}

const SCALE_X_OFFSET = 15
const SCALE_Y_OFFSET = 15

export type ScaleType = 'bar' | 'line'
export const ScaleType = Enum('bar', 'line')

export type Location = 'bottom_left' | 'top_left' | 'bottom_right' | 'top_right'
export const Location = Enum('bottom_left', 'top_left', 'bottom_right', 'top_right')

export type SystemOfMeasure = 'metric' | 'imperial' | 'scientific'
export const SystemOfMeasure = Enum('metric', 'imperial', 'scientific')

export type Units = 'in' | 'ft' | 'mi' | 'km' | 'm' | 'cm' | 'mm' | 'μm' |'nm' | 'pm' | 'fm' | 'am' | 'zm' | 'ym' | 'um'
export const Units = Enum('in', 'ft', 'mi', 'km', 'm', 'cm', 'mm', 'μm', 'nm', 'pm', 'fm', 'am', 'zm', 'ym', 'um')

export type Point = {
    x: number
    y: number
  } 


export class ScaleBarView extends AnnotationView {
  override model: ScaleBar
  override visuals: ScaleBar.Visuals

  unit: string

  protected _render(): void {
    const {ctx} = this.layer
    const {frame} = this.plot_view

    const px_length_init = this.model.length
    this.unit = this.model.unit.toString()

    this._defaults()

    if (!this._errCheck(this.model.system_of_measure, this.unit)) {
      return
    }

    const scale_props = this._scaleProperties(px_length_init, frame.bbox)
    const label_graphics = this._labelsGraphics(scale_props)
    const label_position = this._labelsPosition(scale_props, label_graphics)
    const line_position = this._scaleLineDataPosition(scale_props, label_graphics)
    const bar_position = this._scaleBarDataPosition(scale_props)
    const adj_position = this._locationAdj(frame.bbox, label_graphics, scale_props)
    
    this._drawBarScale(ctx, bar_position, adj_position)
    this._drawLineScale(ctx, line_position, adj_position)
    this._drawLabels(ctx, label_graphics, label_position, adj_position)
  }

  protected _errCheck(sys_measure: string, unit: string) {
    if (((unit in IMPERIAL_UNITS) != true) && 
      (sys_measure == 'imperial') && 
      (this.model.px_size != 'mercator')) {
      console.log('Unit specified not present in list of imperial units (in, ft, mi)')
      return false
    }

    if ((sys_measure == 'metric') && (unit != 'm')) {
      const prefix = unit.replace('m', '')
      let exponent = this._getKeyByValue(SI_PREFIX, prefix)
      if (exponent == '') {
        console.log('Unit specified not present in list of SI prefix, ' + unit)
        return false
      }
    }

    if ((typeof(this.model.px_size) == 'number') && (this.model.px_size <= 0)) {
      console.log('Illegal px_size value specified: ' + this.model.px_size.toString())
      return false
    }

    if (((typeof(this.model.px_size) == 'number') || (this.model.px_size == 'mercator') 
      || (this.model.px_size == 'auto')) == false )  {
      console.log('Illegal px_size value specified. Either "auto, mercator or a positive number".')
      return false
    }
    return true
  }

  protected _defaults() {
    if (this.unit == 'um') {
      this.unit = 'μm'
    }

    if (this.model.px_size == 'mercator') {
      this.unit = 'm'
    }
  }

  protected _scaleProperties(px_length_init: number, bbox: BBox) {
    let px_size = this._calcPxsize(this.model.px_size, bbox, px_length_init)
    const scale_props = this._adjPxsizeSysmeasure(px_size, px_length_init)
    px_size = scale_props.px_size
    
    const distance_init = px_length_init * px_size
    const scale_distance = this._scaleDistance(distance_init)
    const scale_length = Math.round(scale_distance / px_size)

    return {'distance': scale_distance, 'length': scale_length, 'factor': scale_props.scale_factor}
  }

  protected _calcPxsize(model_pxsize: (string | number), bbox: BBox, scale_length: number): number {
    let size = 0
    const xscale = this.coordinates.x_scale
    const yscale = this.coordinates.y_scale

    if (model_pxsize == 'mercator') {
      const {p1, p2} = this._calcPointsLatLonMidCanvas(xscale, yscale, bbox, scale_length)
      let d2 = this._calcGreatCirleDistance(p1, p2)
      size = d2 / scale_length
    } else {
    size = this._calcPxsizeDimensions(xscale, bbox)
      if (typeof(model_pxsize) == 'number') {
        size *= model_pxsize
      }
    }
    return size
  }

  protected _calcPxsizeDimensions(scale: Scale, bbox: BBox): number {
    const rng_x0 = scale.invert(bbox.left);
    const rng_x1 = scale.invert(bbox.right);
    const width = bbox.width;

    return ((rng_x1 - rng_x0) / width)
  }

  protected _calcGreatCirleDistance(point1: [number, number], point2: [number, number]) {
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* Latitude/longitude spherical geodesy tools                         (c) Chris Veness 2002-2021  */
    /*                                                                                   MIT Licence  */
    /* www.movable-type.co.uk/scripts/latlong.html                                                    */
    /* www.movable-type.co.uk/scripts/geodesy-library.html#latlon-spherical                           */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    // Calculate great-circle distance between two points based on haversine formula (ref above).
    // point data format: [lon, lat]

    const lon1 = point1[0]
    const lat1 = point1[1]
    const lon2 = point2[0]
    const lat2 = point2[1]
    
    const R = 6371e3 // metres
    const φ1 = lat1 * Math.PI/180 // φ, λ in radians
    const φ2 = lat2 * Math.PI/180
    const Δφ = (lat2-lat1) * Math.PI/180
    const Δλ = (lon2-lon1) * Math.PI/180

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

    return R * c; // in metres
  }

  protected _calcPointsLatLonMidCanvas(xscale: Scale, yscale: Scale, bbox: BBox, scale_length: number) {
    // define the points to be used to calculate great-circle distance
    // use points in the middel of the canvas that are at a diagonal
    // return points as [lon, lat]
    const width = bbox.width
    const height = bbox.height

    const half_dist = Math.sqrt( ((scale_length/2)**2) / 2 )
    const x0 = bbox.left + (width/2) - half_dist
    const x1 = x0 + 2*half_dist
    
    const y0 = bbox.top + height/2 - half_dist
    const y1 = y0 + 2*half_dist

    const p1 = wgs84_mercator.invert(xscale.invert(x0), yscale.invert(y0))
    const p2 = wgs84_mercator.invert(xscale.invert(x1), yscale.invert(y1))
    
    return {p1, p2} 
  }

  protected _adjPxsizeSysmeasure(px_size: number, length: number) {
    const sys_measure = this.model.system_of_measure
    var unit = this.unit

    const base_prop = this._pxsizeBaseSysmeasure(sys_measure, unit)
    px_size *= base_prop.factor
    unit = base_prop.base_unit

    const scale_factor = this._pxsizeDistanceFactor(sys_measure, px_size, unit, length)
    px_size *= scale_factor.px_adj*scale_factor.scale_factor
    this.unit = scale_factor.unit

    return {'px_size': px_size, 'scale_factor': scale_factor.scale_factor}
  }

  protected _pxsizeBaseSysmeasure(sys_measure: string, unit: string) {
    if (sys_measure == 'imperial') {
      return this._pxsizeBaseImperial(unit)
    } else {
      return this._pxsizeBaseMetric(unit)
    }
  }

  protected _pxsizeBaseMetric(unit: string) {
    const prefix = unit.replace('m', '')
    const exponent = this._getKeyByValue(SI_PREFIX, prefix)
    const factor = Math.pow(10, parseFloat(exponent))
    const base_unit = 'm'

    return {factor, base_unit}
  }

  protected _getKeyByValue(obj: object, val: string) {
    let result = ''
    Object.entries(obj).find(([key, value]) => {
      if (value === val) {
        result = key
        return true
      }
      return false
    });
    return result
  }

  protected _pxsizeBaseImperial(unit: string) {
    var factor = 1
    if (this.model.px_size == 'mercator') {
      factor = 1 / IMPERIAL_UNITS['ft']['m']
    } else {
      factor = IMPERIAL_UNITS[unit]['ft']
    }
    const base_unit = 'ft'

    return {factor, base_unit}
  }

  protected _pxsizeDistanceFactor(sys_measure: string, px_size: number, 
    unit: string, length: number) {
    const distance = px_size * length
    if (sys_measure == 'imperial') {
      return this._pxsizeDistanceFactorImperial(distance, unit)
    } else {
      return this._pxsizeDistanceFactorMetric(distance, unit)
    }
  }

  protected _pxsizeDistanceFactorMetric(distance: number, base_unit: string) {
    const px_adj = 1
    const unit = base_unit
    let base = Math.floor(Math.log10(distance))
    base = Math.floor(base / 3)
    let factor = base * 3

    if (factor > 3) {
      factor = 3
    } else if ((factor == 0) && (distance < 5)) {
      factor = -2
    } else if (distance / Math.pow(10, factor) < 2.5) {
      factor = (base - 1) * 3
    }   
    const scale_factor = 1 / Math.pow(10, factor)
  
    return {px_adj, unit, scale_factor}
  }

  protected _pxsizeDistanceFactorImperial(distance: number, base_unit: string) {
    let px_adj = 1
    let scale_factor = 1
    let unit = base_unit

    if (distance > 10000) {
      px_adj = 1/IMPERIAL_UNITS['mi']['ft'] 
      unit = 'mi'
      return {px_adj, unit, scale_factor}
    }
    if (distance >= 3) {
      return {px_adj, unit, scale_factor}
    }
    // distance < 3
    px_adj = 1/IMPERIAL_UNITS['in']['ft'] 
    unit = 'in'

    let base = Math.floor(Math.log10(distance))

    if ((base < 0) && (distance < 0.25)) {
      if (distance / Math.pow(10, base) < 2.5) {
        base -= 1
      }
      scale_factor = 1 / Math.pow(10, base)
    }
    return {px_adj, unit, scale_factor}
  }

  protected _scaleDistance(distance_init: number): number {
    // Find a scale distance that is a nice whole number 
    const multiple_arr = [1, 2, 3, 10, 20, 25, 30, 50, 100, 200, 500, 1000]

    let distance_update =  distance_init
    let err = distance_init
    multiple_arr.reverse()

    for (const elm of multiple_arr) {
      const distance = Math.round(distance_init/elm) * elm
      if (distance == 0) continue

      if (this.model.scale_type == 'bar') {
        const bool_mod3 = distance % 3 === 0
        const bool_mod2 = distance % 2 === 0

        if ((bool_mod3 || bool_mod2) === false) continue
      }

      const err_tmp = Math.abs(distance-distance_init)

      if (err_tmp >= err) continue

      if ((elm < 20) && (distance > 20)) continue
      if ((elm == 20) && (distance > 200)) continue
      if ((elm == 25) && (distance > 500)) continue
      if ((elm == 30) && (distance > 100)) continue
      if ((elm == 50) && (distance > 500)) continue
      if ((elm == 100) && (distance > 1000)) continue
      if ((elm == 200) && (distance > 3000)) continue

      err = err_tmp
      distance_update = distance
    }
    return distance_update
  }

  protected _labelsGraphics(
    scale_props: {'distance': number, 'length': number, 'factor': number}
    ): GraphicsBoxes {
    let label_values: number[]

    const distance = scale_props.distance

    label_values = this._labelValues(distance)
    let labels_graphics = this._valueFormatTick(label_values)
    
    const last_idx = labels_graphics.length-1
    labels_graphics[last_idx] = this._scientificFormatTick(scale_props.factor, label_values)
    
    const unit_graphics = this._unitFormat(scale_props.factor)

    const gboxes = new GraphicsBoxes([...labels_graphics, unit_graphics])
    const txt_visuals = this.visuals.text.values()
    txt_visuals.baseline = 'alphabetic'
    txt_visuals.line_height = 1.0

    gboxes.visuals = txt_visuals

    for (const item of gboxes.items) {
      item.text_height_metric = 'cap'
    }

    return gboxes
  }

  protected _labelValues(distance: number) {
    let split = 1
    const label = []

    if (this.model.scale_type == 'line') {
      return [distance]
    }

    if ((distance % 3) === 0) split = 3
    else if ((distance % 2) === 0) split = 2
    
    for (let i = 0; i < split + 1; i++) {
      const label_value = (distance/split) * i
      label.push(label_value)
    }
    return label
  }

  protected _unitFormat(scale_factor: number) {
    const factor = 1 / scale_factor
    const expo = Math.log10(factor)
    let unit_str: string
    
    if (this.model.system_of_measure == 'metric') {
      unit_str = ` ${SI_PREFIX[expo]}m`
    } else {
      unit_str = ` ${this.unit}`
    }
    return new TextBox({text: unit_str})
  }

  protected _valueFormatTick(ticks: number[]): GraphicsBox[] {
    const formatter = new BasicTickFormatter()
    const graphics = formatter.format_graphics(ticks, {loc: 0})

    return graphics
  }

  protected _scientificFormatTick(scale_factor: number, label: number[]): GraphicsBox {
    const factor = 1 / scale_factor
    const expo = Math.log10(factor)
    const last_label = label[label.length-1]

    if (this.model.system_of_measure == 'metric')
      return new TextBox({text: `${last_label}`})

    if ((expo >= 0) && (expo <= 2))
      return new TextBox({text: `${last_label}`})

    const b = new TextBox({text: `${last_label}·10`})
    const e = new TextBox({text: `${expo}`})
    const graphics =  new BaseExpo(b, e)
    graphics._y_anchor = 'bottom'
    graphics.base.text_height_metric = 'cap'
    graphics.expo.text_height_metric = 'cap'

    return graphics
  }

  protected _labelsPosition(
    scale_props: {'distance': number, 'length': number, 'factor': number},
    labels: GraphicsBoxes
    ): {'sx': number[], 'sy': number, 'align': TextAlign[]} {
    let split = 1
    const sx_arr = []
    const align: TextAlign[] = []
    let sy = -this.model.y_offset

    const n_items = labels.length
    const unit_graphics = labels.items[n_items-1]
    const last_value_label = labels.items[n_items-2]
    const {width: unit_width} = unit_graphics.size()
    const {width: last_value_width} = last_value_label.size()

    if (this.model.scale_type == 'line') {
      const mid = (scale_props.length+2*this.model.padding)/2
      const sx0 = mid - unit_width/2
      const sx1 = sx0 + last_value_width / 2
      sy -= this.model.padding

      return {'sx': [sx0, sx1], 'sy': sy, 'align': ['center', 'left']}
    }

    if ((scale_props.distance % 3) === 0) split = 3
    else if ((scale_props.distance % 2) === 0) split = 2
    
    for (let i = 0; i < split + 1; i++) {
      const sx = (scale_props.length/split) * i
      sx_arr.push(sx)
      align.push('center')
    }
    const sxunit = scale_props.length + last_value_width / 2
    sx_arr.push(sxunit)
    align.push('left')

    sy -= this.model.height

    return {'sx': sx_arr, 'sy': sy, 'align': align}
  }

  protected _locationAdj(bbox: BBox, labels: GraphicsBoxes,
    scale_props: {'distance': number, 'length': number, 'factor': number}
    ) {
    let sx_adj: number = 0
    let sy_adj: number = 0

    const n_items = labels.length
    const label0 = labels.items[0]
    const {width: label0_width} = label0.size()
    const last_value_label = labels.items[n_items-2]
    const {width: last_unit_width} = last_value_label.size()
    const unit_graphics = labels.items[n_items-1]
    const {width: unit_width} = unit_graphics.size()

    if (this.model.location.includes('left')) {
      sx_adj = bbox.left + SCALE_X_OFFSET

      if (this.model.scale_type == 'bar') {
        sx_adj += label0_width/2
      }
    } 

    if (this.model.location.includes('right')) {
      sx_adj = bbox.right - SCALE_X_OFFSET
      sx_adj -= scale_props.length

      if (this.model.scale_type == 'bar') {
        sx_adj -= unit_width
        sx_adj -= last_unit_width/2
      }

      if (this.model.scale_type == 'line') {
        sx_adj -= 2*this.model.padding
      }
    }

    if (this.model.location.includes('bottom')) {
      sy_adj = bbox.bottom - SCALE_Y_OFFSET
    } 

    if (this.model.location.includes('top')) {
      const {height} = labels.max_size()
      sy_adj = bbox.top + SCALE_Y_OFFSET + height
      sy_adj += this.model.y_offset

      if (this.model.scale_type == 'bar') {
        sy_adj += this.model.height
      }

      if (this.model.scale_type == 'line') {
        sy_adj += (2 * this.model.padding)
      }
    }

    return {sx_adj, sy_adj}
  }

  protected _scaleLineDataPosition(
    scale_props: {'distance': number, 'length': number, 'factor': number},
    labels: GraphicsBoxes
    ) {
    let sx0 = this.model.padding
    let sx1 = scale_props.length + this.model.padding
    let sy0 = -this.model.height - this.model.padding
    let sy1 = - this.model.padding
    let sx = [sx0, sx0, sx1, sx1]
    let sy = [sy0, sy1, sy1, sy0]

    const scale = {sx, sy}

    const {height} = labels.max_size()
    sy1 = -height - (2 * this.model.padding) - this.model.y_offset
    sx1 = scale_props.length + 2*this.model.padding
    sx = [0, 0, sx1, sx1]
    sy = [0, sy1, sy1, 0]
    const backgrnd = {sx, sy}

    return {scale, backgrnd}
  }

  protected _scaleBarDataPosition(
    scale_props: {'distance': number, 'length': number, 'factor': number}
    ) {
    const sx0: number = 0
    let color: Color[] = []
    let sx: number[][] = []
    let sy: number[][] = []
    let bar_splits: number = 1

    if ((scale_props.distance % 3) === 0) {
      bar_splits = 3
    } else if ((scale_props.distance % 2) === 0) {
      bar_splits = 4
    }
    
    const split_px = scale_props.length / bar_splits

    for (let i = 0; i < bar_splits; i++) {
      let bar_sx0 = Math.round(sx0 + split_px * i)
      let bar_sx1 = Math.round(sx0 + split_px * (i+1))

      if (i%2 == 0) {
        color.push(this.model.bar_dark_color)
      } else {
        color.push(this.model.bar_light_color)
      }
      sx.push([bar_sx0, bar_sx1, bar_sx1, bar_sx0])
      sy.push([0, 0, -this.model.height, -this.model.height])
    }

    return {sx, sy, color}
  }

  protected _drawLabels(
    ctx: Context2d, labels: GraphicsBoxes,
    label_position: {'sx': number[], 'sy': number, 'align': TextAlign[]}, 
    adj_position: {'sx_adj': number, 'sy_adj': number}) {
    const {sx_adj, sy_adj} = adj_position
    const {sx, sy, align} = label_position

    for (let i = 0; i < labels.length; i++) {
      const label = labels.items[i]
      label.position = {
        sx: sx[i] + sx_adj,
        sy: sy + sy_adj,
        x_anchor: align[i]
      }
      label.paint(ctx)
    }
    this.visuals.line.apply(ctx)
  }

  protected _drawLineScale(
    ctx: Context2d,
    sxy: {'scale': {'sx': number[], 'sy': number[]},
      'backgrnd': {'sx': number[], 'sy': number[]}},
    adj_position: {'sx_adj': number, 'sy_adj': number}
    ) {
    // line type scale: line drawn on-top bar
    if (this.model.scale_type != 'line')
      return

    const {sx_adj, sy_adj} = adj_position
    const {scale, backgrnd} = sxy

    ctx.beginPath()
    for (let i = 0; i < backgrnd.sx.length; i++) {
      let sx = backgrnd.sx[i] + sx_adj
      let sy = backgrnd.sy[i] + sy_adj
      ctx.lineTo(sx, sy)
    }
    ctx.closePath()
    this.visuals.fill.apply(ctx)

    ctx.beginPath()
    for (let i = 0; i < scale.sx.length; i++) {
      const sx = scale.sx[i] + sx_adj
      const sy = scale.sy[i] + sy_adj
      ctx.lineTo(sx, sy)
    }
    ctx.stroke()
    this.visuals.line.apply(ctx)
  }

  protected _drawBarScale(
    ctx: Context2d, 
    sxy_bar: {'sx': number[][], 'sy': number[][], 'color'?: Color[] },
    adj_position: {'sx_adj': number, 'sy_adj': number}
    ) {
    // bar type scale: alternating bars with an outline
    if (this.model.scale_type != 'bar')
      return

    const {sx_adj, sy_adj} = adj_position

    for (let j = 0; j < sxy_bar.sx.length; j++) { 
      ctx.beginPath()
      for (let i = 0; i < sxy_bar.sx[j].length; i++) {
        const sx = sxy_bar.sx[j][i] + sx_adj
        const sy = sxy_bar.sy[j][i] + sy_adj
        ctx.lineTo(sx, sy)
      }
      ctx.closePath()
      if ((this.model.scale_type == 'bar') && (sxy_bar.color)) {
        this.model.fill_color = sxy_bar.color[j]
      }
      this.visuals.fill.apply(ctx)
    }

    const min_sx = Math.min(...sxy_bar.sx[0]) + sx_adj
    const max_sx = Math.max(...sxy_bar.sx[sxy_bar.sx.length-1]) + sx_adj
    const min_sy = Math.min(...sxy_bar.sy[0]) + sy_adj
    const max_sy = Math.max(...sxy_bar.sy[0]) + sy_adj

    ctx.beginPath()
    ctx.lineTo(min_sx, min_sy)
    ctx.lineTo(max_sx, min_sy)
    ctx.lineTo(max_sx, max_sy)
    ctx.lineTo(min_sx, max_sy)
    ctx.closePath()
    this.visuals.line.apply(ctx)
  }
}

export namespace ScaleBar {
  export type Attrs = p.AttrsOf<Props>

  export type Props = Annotation.Props & {
    scale_type: p.Property<ScaleType>
    bar_dark_color: p.Property<Color>
    bar_light_color: p.Property<Color>
    px_size: p.Property< string | number | 'auto'>
    length: p.Property<number>
    height: p.Property<number>
    y_offset: p.Property<number>
    padding: p.Property<number>
    location: p.Property<Location>
    unit: p.Property<Units>
    system_of_measure: p.Property<SystemOfMeasure>
  } & Mixins

  export type Mixins = mixins.Line & mixins.Fill & mixins.Text

  export type Visuals = Annotation.Visuals & {line: visuals.Line, fill: visuals.Fill, text: visuals.Text}
}

export interface ScaleBar extends ScaleBar.Attrs {}

export class ScaleBar extends Annotation {
  override properties: ScaleBar.Props
  override __view_type__: ScaleBarView

  constructor(attrs?: Partial<ScaleBar.Attrs>) {
    super(attrs)
  }

  static {
    this.prototype.default_view = ScaleBarView

    this.mixins<ScaleBar.Mixins>([mixins.Line, mixins.Fill, mixins.Text])

    this.define<ScaleBar.Props>(({Color, Auto, Or, String, Number}) => ({
      scale_type:         [ ScaleType, 'bar' ],
      bar_dark_color:     [ Color, 'grey' ],
      bar_light_color:    [ Color, 'white'],
      px_size:            [ Or(String, Number, Auto), 'auto' ],
      length:             [ Number, 125 ],
      height:             [ Number, 7 ],
      y_offset:           [ Number, 3 ],
      padding:            [ Number, 2 ],
      location:           [ Location, 'bottom_left' ],
      unit:               [ Units, 'm'],
      system_of_measure:  [ SystemOfMeasure, 'metric' ]
    }))

    this.override<ScaleBar.Props>({
      text_color: '#444444',
      text_font: 'helvetica',
      text_font_size: '11px',
      text_font_style: 'normal',
      line_color: '#444444',
      line_alpha: 1,
      line_width: 1,
      fill_alpha: 1.0,
    })
  }
}
