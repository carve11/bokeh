import {Annotation, AnnotationView} from "models/annotations/annotation"
import * as mixins from "core/property_mixins"
import * as visuals from "core/visuals"
import * as p from "core/properties"
import {Context2d} from "core/util/canvas"
import {TextBox} from "core/graphics"
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

  px_size_val: number
  unit: string
  scale_distance: number
  scale_length: number
  scale0: Point = {x: 0, y: 0}
  scale1: Point = {x: 0, y: 0}

  protected _render(): void {
    const {ctx} = this.layer
    const {frame} = this.plot_view

    const scale_length_init = this.model.length
    const font_size_val = parseFloat(this.model.text_font_size)

    this.unit = this.model.unit.toString()
    const sys_measure = this.model.system_of_measure

    this._defaults()

    if (!this._errCheck(sys_measure, this.unit)) {
      return
    }

    this.px_size_val = this._calcPxsize(this.model.px_size, frame.bbox, scale_length_init)
    this._adjPxsize(sys_measure, this.px_size_val, this.unit)

    let scale_distance_init = scale_length_init * this.px_size_val
    let scale_factor = this._calcConversion(sys_measure, scale_distance_init)

    scale_distance_init = scale_distance_init * scale_factor
    this.px_size_val = this.px_size_val * scale_factor

    const scale_multiple = this._scaleMultiple(scale_distance_init)

    this.scale_distance = Math.round(scale_distance_init/scale_multiple)*scale_multiple
    this.scale_length = Math.round(this.scale_distance / this.px_size_val)

    this._locationData(frame.bbox, font_size_val)

    const rect_data = this._scalePointData(font_size_val)
    
    this._drawBarRect(ctx, rect_data.xy)
    
    let line_xy = this._scaleOutlineLine()
    this._drawOutlineLineScale(ctx, line_xy)

    this._addLabels(ctx, rect_data.labels, font_size_val)
  }

  protected _errCheck(sys_measure: string, unit: string) {
    if (((unit in IMPERIAL_UNITS) != true) && (sys_measure == 'imperial') && (this.model.px_size != 'mercator')) {
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

  protected _adjPxsize(sys_measure: string, size: number, unit: string) {
    if (sys_measure == 'imperial') {
      if (this.model.px_size == 'mercator') {
        this.px_size_val = size / IMPERIAL_UNITS['ft']['m']
      } else {
        this.px_size_val = size * IMPERIAL_UNITS[unit]['ft']
      }
      this.unit = 'ft'
    }

    if ((sys_measure == 'metric') && (unit != 'm')) {
      const prefix = unit.replace('m', '')
      let exponent = this._getKeyByValue(SI_PREFIX, prefix)
      this.px_size_val = size * Math.pow(10, parseFloat(exponent))
      this.unit = 'm'
    }
  }

  protected _calcConversion(sys_measure: string, distance: number): number {
    let conv_factor = 1
    if ((sys_measure == 'metric') || (sys_measure == 'scientific')) {
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
      
      conv_factor = 1/Math.pow(10, factor)
      if (sys_measure == 'metric') {
        this.unit = SI_PREFIX[factor] + 'm'  
      } else {
        if ((factor < 0) || (factor > 2)) {
          this.unit = '10e' + factor.toString() + ' ' + this.unit
        }
      } 

    } else if (sys_measure == 'imperial') {
      if (distance > 10000) {
        conv_factor = 1/IMPERIAL_UNITS['mi']['ft'] 
        this.unit = 'mi'
      } else if (distance < 3) {
        conv_factor = 1/IMPERIAL_UNITS['in']['ft'] 
        this.unit = 'in'

        let base = Math.floor(Math.log10(distance))

        if ((base < 0) && (distance < 0.25)) {
          if (distance / Math.pow(10, base) < 2.5) {
            base -= 1
          }
          conv_factor = conv_factor / Math.pow(10, base)
          this.unit = '10e' + base.toString() + ' in'
        }
      }
    }
    return conv_factor
  }

  protected _scaleMultiple(scale_distance_init: number): number {
    const scale_type = this.model.scale_type
    const scale_multiple_arr = [1, 2, 3, 10, 20, 25, 30, 50, 100, 200, 500, 1000]

    let tmp_multiple = 2
    let err = scale_distance_init
    for (let i = scale_multiple_arr.length-1; i >= 0 ; i--) {
      const distance = Math.round(scale_distance_init/scale_multiple_arr[i])*scale_multiple_arr[i]

      if (scale_type == 'bar') {
        if ( (((distance % 3) === 0) || ((distance % 2) === 0)) === false ) {
          continue
        }
      }
      if (Math.abs(scale_distance_init-distance) < err) {
        if ((scale_multiple_arr[i] < 20) && (distance > 20)) {
          continue
        }
        if ((scale_multiple_arr[i] == 20) && (distance > 200)) {
          continue
        }
        if ((scale_multiple_arr[i] == 25) && (distance > 500)) {
          continue
        }
        if ((scale_multiple_arr[i] == 30) && (distance > 100)) {
          continue
        }
        if ((scale_multiple_arr[i] == 50) && (distance > 500)) {
          continue
        }
        if ((scale_multiple_arr[i] == 100) && (distance > 1000)) {
          continue
        }
        if ((scale_multiple_arr[i] == 200) && (distance > 3000)) {
          continue
        }
        err = Math.abs(scale_distance_init-distance)
        tmp_multiple = scale_multiple_arr[i]
      }
    }
    return tmp_multiple
  }

  protected _sumArr(arr: number[]) {
    let sum = 0
    for (let i = 0; i < arr.length; i ++) {
      sum += arr[i]
    }
    return sum
  }

  protected _sxLabelScientific(sxArr: number[], widthArr: number[], sxMid: number, align: string[]) {
    const totalWidth = this._sumArr(widthArr)
    let sx = sxMid - totalWidth/2
    for (let i = 0; i < widthArr.length; i++) {
      sxArr.push(sx)
      align.push('left')
      sx += widthArr[i]
    }
  }

  protected _labelScientific(label: string, sx: number, sy: number, font_size: number) {
    let txt_box = []
    let sy_arr: number[] = []
    let sx_arr: number[] = []
    let widths: number[] = []
    let align: string[] = []

    const splitTxt = label.split(' ')

    for (let j = 0; j < splitTxt.length; j++) {
      const baseExp = splitTxt[j].split('e')
      const {tb, width} = this._txtBox(baseExp[0])
      txt_box.push(tb)
      sy_arr.push(sy)
      widths.push(width)
      
      if (baseExp.length > 1) {
        const {tb, width} = this._txtBox(baseExp[1])
        tb.font_size_scale = 0.7
        txt_box.push(tb)
        sy_arr.push(sy-(1/3)*font_size)
        widths.push(width)
      }
    }

    this._sxLabelScientific(sx_arr, widths, sx, align)

    return {txt_box, sy_arr, sx_arr, widths, align}
  }

  protected _txtBox(txt: string) {
    const tb = new TextBox({text: txt})
    const {width} = tb._size()

    return {tb, width}
  }

  protected _addLabels(ctx: Context2d, label_data: {'txt': string[], 'x': number[], 'y': number[]}, font_size: number) {
    const txt_visuals = this.visuals.text.values()
    const label_align_default = 'center'
    txt_visuals.baseline = 'alphabetic'

    let label_width_arr = []
    let label_align_arr = []
    let label_box_arr = []
    let label_sx_arr = []
    let label_sy_arr = []

    for (let i = 0, end = label_data.txt.length; i < end; i++) {  
      const y_offset_i = this.model.y_offset
      let sx_i: number = label_data.x[i]
      const sy_i: number = label_data.y[i] - y_offset_i

      if (label_data.txt[i].includes('10e')) {
        const {txt_box, sy_arr, sx_arr, widths, align} = this._labelScientific(label_data.txt[i], sx_i, sy_i, font_size)

        label_width_arr.push(...widths)
        label_align_arr.push(...align)
        label_box_arr.push(...txt_box)
        label_sx_arr.push(...sx_arr)
        label_sy_arr.push(...sy_arr)
        
      } else {
        let align = label_align_default
        const {tb, width} = this._txtBox(label_data.txt[i])

        if ((this.model.scale_type == 'bar') && (i == end - 1)) {
          // adjust x position last item (unit string)
          sx_i += label_width_arr[i-1] / 2
          align = 'left'
        }

        label_width_arr.push(width)
        label_box_arr.push(tb)
        label_sx_arr.push(sx_i)
        label_sy_arr.push(sy_i)
        label_align_arr.push(align)
      }
    }
    
    for (let i = 0; i < label_box_arr.length; i++) {
      const align = label_align_arr[i] as TextAlign
      txt_visuals.align = align
      label_box_arr[i].position = {sx: label_sx_arr[i], sy: label_sy_arr[i]}
      label_box_arr[i].visuals = txt_visuals
      label_box_arr[i].paint(ctx)
    }
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

  protected _locationData(bbox: BBox, font_size: number) {
    let y0: number = 0
    let y1: number = 0
    const scale_dy = this.model.height
    const label_yoffset = this.model.y_offset

    if (this.model.location.includes('right')) {
      let width_out_bar = 0
      if (this.model.scale_type == 'bar') {
        const {width: wdistance} = this._txtBox(this.scale_distance.toString())
        width_out_bar += wdistance / 2

        const {width: wunit} = this._txtBox(' ' + this.unit)
        width_out_bar += wunit
      }
      width_out_bar += SCALE_X_OFFSET

      this.scale1.x = bbox.right-width_out_bar
      this.scale0.x = this.scale1.x - this.scale_length
    } else {
      this.scale0.x = bbox.left + SCALE_X_OFFSET
      this.scale1.x = this.scale0.x + this.scale_length
    }
    
    if (this.model.location.includes('bottom')) {
      y0 = bbox.bottom - SCALE_Y_OFFSET
    } else {
      y0 = bbox.top + SCALE_Y_OFFSET

      if (this.model.scale_type == 'bar') {
        y0 += font_size + label_yoffset + scale_dy
      } else {
        y0 += Math.max(font_size+label_yoffset, scale_dy)
      }
    }
    y1 = y0 - scale_dy
    
    this.scale0.y = y0
    this.scale1.y = y1
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

  protected _scalePointData(font_size: number): {
    'xy': {'x': number[][]; 'y': number[][]; 'color'?: Color[] }
    'labels': {'txt': string[]; 'x': number[]; 'y': number[]}
    } {
    if (this.model.scale_type == 'bar') {
      return this._scaleBarData()
    } else {
      return this._scaleLineData(font_size)
    }
  }

  protected _scaleBarData(): {
      'xy': {'x': number[][]; 'y': number[][]; 'color': Color[] }
      'labels': {'txt': string[]; 'x': number[]; 'y': number[]}
    } {
    // Bar scale is alternating dark and light colors
    let color = []
    let bar_x = []
    let bar_y = []
    let label = []
    let label_y = []
    let label_x = []
    let bar_splits = 1
    const x0:number = this.scale0.x, y0:number = this.scale0.y
    const x1:number = this.scale1.x, y1:number = this.scale1.y

    if ((this.scale_distance % 3) === 0) {
      bar_splits = 3
    } else if ((this.scale_distance % 2) === 0) {
      bar_splits = 4
    }
    
    const split_px = this.scale_length / bar_splits
    for (let i = 0; i < bar_splits; i++) {
      const label_value = this.scale_distance/bar_splits*i
      const label_str = label_value.toString()
      let bar_x0 = Math.round(x0 + split_px * i)
      let bar_x1 = Math.round(x0 + split_px * (i+1))
      
      if (i%2 == 0) {
        color.push(this.model.bar_dark_color)
      } else {
        color.push(this.model.bar_light_color)
      }
      bar_x.push([bar_x0, bar_x1, bar_x1, bar_x0])
      bar_y.push([y0, y0, y1, y1])

      if ((i%2 == 0) || (bar_splits == 3)) {
        label.push(label_str)
        label_y.push(y1)
        label_x.push(bar_x0)
      }
    }

    label.push(this.scale_distance.toString())
    label_y.push(y1)
    label_x.push(x1)

    label.push(' ' + this.unit)
    label_y.push(y1)
    label_x.push(x1)

    const xy = {'x': bar_x, 'y': bar_y, 'color': color}
    const labels = {'txt': label, 'x': label_x, 'y': label_y}

    return {'xy': xy, 'labels': labels}
  }

  protected _scaleLineData(font_size: number): {
      'xy': {'x': number[][]; 'y': number[][]; }
      'labels': {'txt': string[]; 'x': number[]; 'y': number[]}
    } {
    const label_yoffset = this.model.y_offset
    const scale_dy = this.model.height
    const padding = this.model.padding
    const x0:number = this.scale0.x, y0:number = this.scale0.y
    const x1:number = this.scale1.x, y1:number = this.scale1.y

    let label_txt = this.scale_distance.toString()

    if (this.unit.length > 0) {
      if (this.unit.includes('10e')) {
        label_txt += '·'
      } else {
        label_txt += ' '
      }
      label_txt += this.unit
    }

    let adj_height = 0
    if (label_txt.includes('10e')) {
      adj_height = 2
    }
    const adjust_top = Math.max(font_size + label_yoffset - scale_dy + adj_height, padding)
    const x = [[x0-padding, x1+padding, x1+padding, x0-padding]]
    const y = [[y0+padding, y0+padding, y1-adjust_top, y1-adjust_top]]

    const label_x = [(x1+x0) / 2]
    const label_y = [y0 - label_yoffset]

    const xy = {'x': x, 'y': y}
    const label = {'txt': [label_txt], 'x': label_x, 'y': label_y}

    return {'xy': xy, 'labels': label}
  }

  protected _scaleOutlineLine() {
    let x: number[]
    let y: number[]
    const scale_type = this.model.scale_type
    const x0:number = this.scale0.x, y0:number = this.scale0.y
    const x1:number = this.scale1.x, y1:number = this.scale1.y

    if (scale_type == 'bar') {
      x = [x0, x1, x1, x0]
      y = [y0, y0, y1, y1]
    } else {
      x = [x0, x0, x1, x1]
      y = [y1, y0, y0, y1]
    }
    return {'x': x, 'y': y}
  }

  protected _drawOutlineLineScale(ctx: Context2d, xy_data: {'x': number[], 'y': number[]}) {
    ctx.beginPath()
    for (let i = 0; i < xy_data.x.length; i++) {
      ctx.lineTo(xy_data.x[i], xy_data.y[i])
    }

    if (this.model.scale_type == 'bar') {
      ctx.closePath()
    } else {
      ctx.stroke()
    }
    this.visuals.line.apply(ctx)
  }

  protected _drawBarRect(ctx: Context2d, xy_data: {'x': number[][], 'y': number[][], 'color'?: Color[] }) {
    for (let j = 0; j < xy_data.x.length; j++) { 
      ctx.beginPath()
      for (let i = 0; i < xy_data.x[j].length; i++) {
        ctx.lineTo(xy_data.x[j][i], xy_data.y[j][i])
      }
      ctx.closePath()
      if ((this.model.scale_type == 'bar') && (xy_data.color)) {
        this.model.fill_color = xy_data.color[j]
      }
      this.visuals.fill.apply(ctx)
    }
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
