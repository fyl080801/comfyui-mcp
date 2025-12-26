import { get } from 'lodash-es'

export const convertInputProp = (prop: string) => {
  return prop.split('.').reduce((target: string[], key: any, index: number) => {
    if (index === 1) {
      target.push('inputs')
    }

    target.push(`${key}`)

    return target
  }, [])
}

export const getInputPropValue = (param: any, prop: string) => {
  return get(param, convertInputProp(prop))
}

export const getInputValue = (params: any, param: any) => {
  let value = getInputPropValue(params, param.name)

  if (![null, undefined].includes(value) && param.dataType === 'number') {
    if (![null, undefined].includes(param.min)) {
      value = Math.max(+value, +param.min)
    }
    if (![null, undefined].includes(param.max)) {
      value = Math.min(+value, +param.max)
    }
  }

  return value
}
